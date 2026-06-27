/**
 * scheduler-api.ts
 *
 * Thin layer over the nielsfaber/scheduler-component websocket API and services.
 * All HA interaction goes through here; the rest of the card code stays HA-free.
 */

import { DayKey, SCHEDULER_TAG, ScheduleMode, modeTag, scheduleModeForDeviceMode } from './const.js';
import {
  DayGroup,
  Setpoint,
  WeekModel,
  expandGroupsToWeek,
  groupDaysByIdenticalSlots,
} from './model.js';

// ───────────────────── HA type shims ──────────────────────────────

export interface Hass {
  states: Record<string, HassEntity>;
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  /** HA websocket connection — available on the real `hass` object injected by Lovelace. */
  connection?: {
    subscribeEvents(cb: (ev: unknown) => void, eventType: string): Promise<() => void>;
  };
}

interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

// ───────────────────── Scheduler WS types ─────────────────────────

interface SchedulerAction {
  entity_id: string;
  service: string;
  service_data?: Record<string, unknown>;
}

interface SchedulerCondition {
  entity_id: string;
  value: string;
  match_type: 'is' | 'not' | 'above' | 'below';
}

interface SchedulerTimeslot {
  start: string;
  actions: SchedulerAction[];
  conditions?: SchedulerCondition[];
  condition_type?: 'and' | 'or';
  track_conditions?: boolean;
}

interface SchedulerItemResponse {
  schedule_id: string;
  entity_id: string;
  weekdays: string[];
  timeslots: SchedulerTimeslot[];
  tags?: string[];
  name?: string;
  enabled?: boolean;
}

// ───────────────────── Live subscription ──────────────────────────

/**
 * Subscribe to `scheduler_updated` events so the card refreshes automatically
 * when any schedule changes externally (another UI, automation, etc.).
 * Returns an unsubscribe function, or undefined if the connection API is unavailable.
 */
export async function subscribeScheduleChanges(
  hass: Hass,
  cb: () => void,
): Promise<(() => void) | undefined> {
  if (!hass.connection?.subscribeEvents) return undefined;
  try {
    return await hass.connection.subscribeEvents(() => cb(), 'scheduler_updated');
  } catch (e) {
    console.warn('[hvac-scheduler] subscribeEvents failed:', e);
    return undefined;
  }
}

// ───────────────────── Debug ───────────────────────────────────────

export const DEBUG = true; // set false to silence logs

function dbg(...args: unknown[]) {
  if (DEBUG) console.log('[hvac-scheduler]', ...args);
}

// ───────────────────── Read ────────────────────────────────────────

/**
 * Load the WeekModel from the scheduler integration for a given climate entity
 * and schedule mode bucket (heat / cool / heat_cool).
 * Returns an empty week if the integration is not available or no schedules exist yet.
 */
export async function fetchWeekForClimate(
  hass: Hass,
  climateEntityId: string,
  scheduleMode: ScheduleMode
): Promise<{ week: WeekModel; ownedEntities: Record<string, string[]> }> {
  dbg(`fetchWeekForClimate called for entity="${climateEntityId}" mode="${scheduleMode}"`);

  // ownedEntities: entityId → weekdays[]
  let items: SchedulerItemResponse[] = [];

  try {
    // scheduler-component returns all items as a flat array
    const raw = await hass.callWS<unknown>({ type: 'scheduler' });
    dbg('raw scheduler WS response:', JSON.parse(JSON.stringify(raw)));
    items = (Array.isArray(raw) ? raw : []) as SchedulerItemResponse[];
    dbg(`parsed ${items.length} scheduler item(s) from response`);
  } catch (e) {
    dbg('scheduler WS call failed, falling back to states:', e);
    const fallback = _weekFromStates(hass, climateEntityId, scheduleMode);
    return { week: fallback.week, ownedEntities: {} };
  }

  const ownedGroups: DayGroup[] = [];
  const ownedEntities: Record<string, string[]> = {};
  const tag = modeTag(scheduleMode);

  for (const item of items) {
    const tags = item.tags ?? [];
    const actions = item.timeslots?.flatMap((ts) => ts.actions) ?? [];
    const matchesEntity = actions.some((a) => a.entity_id === climateEntityId);
    const hasBaseTag = tags.includes(SCHEDULER_TAG);
    const hasModeTag = tags.includes(tag);
    dbg(
      `item ${item.schedule_id} (${item.entity_id}):`,
      `tags=${JSON.stringify(tags)}`,
      `matchesEntity=${matchesEntity}`,
      `hasBaseTag=${hasBaseTag}`,
      `hasModeTag=${hasModeTag}`,
      `weekdays=${JSON.stringify(item.weekdays)}`,
      `timeslots=${JSON.stringify(item.timeslots)}`,
    );

    // Must target this entity and carry the base ownership tag
    if (!hasBaseTag || !matchesEntity) {
      dbg(`  → skipped (not owned)`);
      continue;
    }

    if (hasModeTag) {
      // Modern: explicitly tagged with this mode bucket
      const setpoints = _timeslotsToSetpoints(item.timeslots);
      const weekdays = item.weekdays.filter((d) =>
        ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(d)
      ) as DayKey[];
      dbg(`  → accepted (mode tag): weekdays=${JSON.stringify(weekdays)}, setpoints=${JSON.stringify(setpoints)}`);
      ownedGroups.push({ weekdays, setpoints, entityId: item.entity_id });
      ownedEntities[item.entity_id] = weekdays;
    } else {
      // Legacy: no mode tag — bucket by the hvac_mode stored in timeslot service_data
      const hasAnyModeTag = SCHEDULE_MODES_FOR_MIGRATION.some((m) => tags.includes(modeTag(m)));
      if (hasAnyModeTag) {
        // Tagged for a different mode; skip
        dbg(`  → skipped (tagged for other mode)`);
        continue;
      }
      // Infer bucket from the timeslots' hvac_mode service_data
      const inferredMode = _inferModeFromTimeslots(item.timeslots);
      if (inferredMode !== scheduleMode) {
        dbg(`  → skipped (legacy, inferred mode="${inferredMode}" != "${scheduleMode}")`);
        continue;
      }
      const setpoints = _timeslotsToSetpoints(item.timeslots);
      const weekdays = item.weekdays.filter((d) =>
        ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(d)
      ) as DayKey[];
      dbg(`  → accepted (legacy): weekdays=${JSON.stringify(weekdays)}, setpoints=${JSON.stringify(setpoints)}`);
      ownedGroups.push({ weekdays, setpoints, entityId: item.entity_id });
      ownedEntities[item.entity_id] = weekdays;
    }
  }

  dbg(`result: ${ownedGroups.length} owned group(s)`);
  return { week: expandGroupsToWeek(ownedGroups), ownedEntities };
}

// All schedule mode values for migration checks (avoids importing SCHEDULE_MODES from const at runtime)
const SCHEDULE_MODES_FOR_MIGRATION: ScheduleMode[] = ['heat', 'cool', 'heat_cool'];

/**
 * Infer which schedule mode bucket a legacy (untagged) item belongs to
 * by looking at the hvac_mode in each timeslot's service_data.
 * Falls back to null if indeterminate.
 */
function _inferModeFromTimeslots(timeslots: SchedulerTimeslot[]): ScheduleMode | null {
  for (const ts of timeslots) {
    for (const action of ts.actions) {
      const hvacMode = action.service_data?.hvac_mode;
      if (typeof hvacMode === 'string') {
        return scheduleModeForDeviceMode(hvacMode);
      }
    }
  }
  return null;
}

/** Fallback: build week from switch.schedule_* state attributes when WS is unavailable */
function _weekFromStates(
  hass: Hass,
  climateEntityId: string,
  scheduleMode: ScheduleMode
): { week: WeekModel; ownedEntities: Record<string, string[]> } {
  const groups: DayGroup[] = [];
  const ownedEntities: Record<string, string[]> = {};
  const tag = modeTag(scheduleMode);

  for (const [eid, entity] of Object.entries(hass.states)) {
    if (!eid.startsWith('switch.schedule_')) continue;
    const attrs = entity.attributes;
    const tags: string[] = (attrs.tags as string[] | undefined) ?? [];
    if (!tags.includes(SCHEDULER_TAG)) continue;
    const timeslots = (attrs.timeslots as SchedulerTimeslot[] | undefined) ?? [];
    const actionsFlat = timeslots.flatMap((ts) => ts.actions ?? []);
    if (!actionsFlat.some((a) => a.entity_id === climateEntityId)) continue;

    // Mode filtering: require mode tag (or fall back to inferred mode for legacy items)
    if (tags.includes(tag)) {
      // Modern mode-tagged item
    } else {
      const hasAnyModeTag = SCHEDULE_MODES_FOR_MIGRATION.some((m) => tags.includes(modeTag(m)));
      if (hasAnyModeTag) continue; // tagged for a different mode
      const inferredMode = _inferModeFromTimeslots(timeslots);
      if (inferredMode !== scheduleMode) continue;
    }

    const weekdays = ((attrs.weekdays as string[] | undefined) ?? []).filter((d) =>
      ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(d)
    ) as DayKey[];
    const setpoints = _timeslotsToSetpoints(timeslots);
    groups.push({ weekdays, setpoints, entityId: eid });
    ownedEntities[eid] = weekdays;
  }
  return { week: expandGroupsToWeek(groups), ownedEntities };
}

function _timeslotsToSetpoints(timeslots: SchedulerTimeslot[]): Setpoint[] {
  return timeslots.map((ts) => {
    const action = ts.actions[0];
    const sd = action?.service_data ?? {};
    const setpoint: Setpoint = { time: ts.start };
    if (typeof sd.temperature === 'number') setpoint.temp = sd.temperature;
    if (typeof sd.target_temp_low === 'number') setpoint.tempLow = sd.target_temp_low;
    if (typeof sd.target_temp_high === 'number') setpoint.tempHigh = sd.target_temp_high;
    if (typeof sd.hvac_mode === 'string') setpoint.hvacMode = sd.hvac_mode;
    return setpoint;
  });
}

// ───────────────────── Write ───────────────────────────────────────

export interface WriteWeekOptions {
  hass: Hass;
  climateEntityId: string;
  /** The schedule bucket being saved */
  scheduleMode: ScheduleMode;
  week: WeekModel;
  /** Previous entity → weekdays mapping so we can diff / remove stale ones */
  previousOwnedEntities: Record<string, string[]>;
}

/**
 * Write the full week model to the scheduler integration.
 * Diffs the current owned entities vs the grouped target:
 *   - Groups with an existing entity → scheduler.edit
 *   - New groups → scheduler.add
 *   - Entities no longer needed → scheduler.remove
 */
export async function writeWeek(opts: WriteWeekOptions): Promise<void> {
  const { hass, climateEntityId, scheduleMode, week, previousOwnedEntities } = opts;

  // Filter out days with no setpoints; those just need their existing entity removed
  const allGroups = groupDaysByIdenticalSlots(week);
  const nonEmptyGroups = allGroups.filter((g) => g.setpoints.length > 0);

  // Match groups to existing entities by weekday overlap
  const remainingEntities = new Set(Object.keys(previousOwnedEntities));
  const ops: Array<() => Promise<void>> = [];
  const tags = [SCHEDULER_TAG, modeTag(scheduleMode)];
  for (const group of nonEmptyGroups) {
    // Find an existing entity whose weekdays fully overlap (best match)
    let matchedEntityId: string | undefined;
    let bestScore = 0;

    for (const [eid, prevDays] of Object.entries(previousOwnedEntities)) {
      if (!remainingEntities.has(eid)) continue; // already claimed by an earlier group
      const overlap = group.weekdays.filter((d) => prevDays.includes(d)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        matchedEntityId = eid;
      }
    }

    const timeslots = _setpointsToTimeslots(group.setpoints, climateEntityId, scheduleMode);

    if (matchedEntityId && bestScore > 0) {
      remainingEntities.delete(matchedEntityId);
      const eid = matchedEntityId;
      ops.push(() =>
        hass.callService('scheduler', 'edit', {
          entity_id: eid,
          weekdays: group.weekdays,
          timeslots,
          tags,
          repeat_type: 'repeat',
        })
      );
    } else {
      ops.push(() =>
        hass.callService('scheduler', 'add', {
          weekdays: group.weekdays,
          timeslots,
          tags,
          repeat_type: 'repeat',
          name: `hvac-scheduler-card_${climateEntityId}_${scheduleMode}`,
        })
      );
    }
  }

  // Remove stale entities (days now empty, or over-merged)
  for (const eid of remainingEntities) {
    ops.push(() => hass.callService('scheduler', 'remove', { entity_id: eid }));
  }

  // Execute sequentially to avoid race conditions with scheduler component
  for (const op of ops) {
    await op();
  }
}

function _setpointsToTimeslots(
  setpoints: Setpoint[],
  climateEntityId: string,
  scheduleMode: ScheduleMode,
): SchedulerTimeslot[] {
  const conditions: SchedulerCondition[] = scheduleMode === 'heat_cool'
    ? [
        { entity_id: climateEntityId, value: 'heat_cool', match_type: 'is' },
        { entity_id: climateEntityId, value: 'auto', match_type: 'is' },
      ]
    : [{ entity_id: climateEntityId, value: scheduleMode, match_type: 'is' }];
  const condition_type: 'or' | undefined = scheduleMode === 'heat_cool' ? 'or' : undefined;

  return setpoints.map((sp) => {
    const service_data: Record<string, unknown> = {};

    if (scheduleMode === 'heat_cool') {
      // Omit hvac_mode for heat_cool bucket so we don't force an auto device to heat_cool
      if (sp.tempLow != null && sp.tempHigh != null) {
        service_data.target_temp_low = sp.tempLow;
        service_data.target_temp_high = sp.tempHigh;
      }
    } else {
      // heat or cool — set hvac_mode explicitly so it always wins
      service_data.hvac_mode = sp.hvacMode ?? scheduleMode;
      if (sp.temp != null) {
        service_data.temperature = sp.temp;
      }
    }

    const timeslot: SchedulerTimeslot = {
      start: sp.time,
      actions: [
        {
          entity_id: climateEntityId,
          service: 'climate.set_temperature',
          service_data,
        },
      ],
      conditions,
      track_conditions: true,
    };
    if (condition_type) timeslot.condition_type = condition_type;
    return timeslot;
  });
}

