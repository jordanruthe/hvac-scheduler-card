/**
 * scheduler-api.test.ts
 *
 * Unit tests for the per-mode schedule logic added in the multi-mode feature:
 *   - scheduleModeForDeviceMode mapping
 *   - modeTag helper
 *   - fetchWeekForClimate mode filtering (modern tags, legacy bucketing, other-mode skip)
 *   - writeWeek per-mode tags + per-timeslot conditions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Hass } from '../scheduler-api.js';
import { fetchWeekForClimate, writeWeek } from '../scheduler-api.js';
import { scheduleModeForDeviceMode, modeTag, SCHEDULER_TAG } from '../const.js';

// ── scheduleModeForDeviceMode ────────────────────────────────────

describe('scheduleModeForDeviceMode', () => {
  it('maps heat → heat', () => expect(scheduleModeForDeviceMode('heat')).toBe('heat'));
  it('maps cool → cool', () => expect(scheduleModeForDeviceMode('cool')).toBe('cool'));
  it('maps heat_cool → heat_cool', () => expect(scheduleModeForDeviceMode('heat_cool')).toBe('heat_cool'));
  it('maps auto → heat_cool', () => expect(scheduleModeForDeviceMode('auto')).toBe('heat_cool'));
  it('maps off → null', () => expect(scheduleModeForDeviceMode('off')).toBeNull());
  it('maps dry → null', () => expect(scheduleModeForDeviceMode('dry')).toBeNull());
  it('maps fan_only → null', () => expect(scheduleModeForDeviceMode('fan_only')).toBeNull());
  it('maps unknown → null', () => expect(scheduleModeForDeviceMode('unknown')).toBeNull());
});

// ── modeTag ─────────────────────────────────────────────────────

describe('modeTag', () => {
  it('produces correct tag for heat', () => expect(modeTag('heat')).toBe('hvac-scheduler-card:heat'));
  it('produces correct tag for cool', () => expect(modeTag('cool')).toBe('hvac-scheduler-card:cool'));
  it('produces correct tag for heat_cool', () => expect(modeTag('heat_cool')).toBe('hvac-scheduler-card:heat_cool'));
});

// ── Helpers ──────────────────────────────────────────────────────

const ENTITY = 'climate.thermostat';

/** Build a minimal mock Hass object */
function makeMockHass(items: unknown[]): Hass {
  return {
    states: {},
    callWS: vi.fn().mockResolvedValue(items),
    callService: vi.fn().mockResolvedValue(undefined) as Hass['callService'],
  };
}

/** Build a scheduler item with given tags and timeslot hvac_mode */
function makeItem(opts: {
  id?: string;
  entityId?: string;
  tags: string[];
  weekdays?: string[];
  hvacMode?: string;
  temp?: number;
  tempLow?: number;
  tempHigh?: number;
}) {
  const {
    id = 'sched_1',
    entityId = 'switch.schedule_1',
    tags,
    weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'],
    hvacMode,
    temp,
    tempLow,
    tempHigh,
  } = opts;

  const service_data: Record<string, unknown> = {};
  if (hvacMode !== undefined) service_data.hvac_mode = hvacMode;
  if (temp !== undefined) service_data.temperature = temp;
  if (tempLow !== undefined) service_data.target_temp_low = tempLow;
  if (tempHigh !== undefined) service_data.target_temp_high = tempHigh;

  return {
    schedule_id: id,
    entity_id: entityId,
    weekdays,
    tags,
    timeslots: [
      {
        start: '06:00',
        actions: [{ entity_id: ENTITY, service: 'climate.set_temperature', service_data }],
      },
    ],
  };
}

// ── fetchWeekForClimate ─────────────────────────────────────────

describe('fetchWeekForClimate', () => {
  it('returns empty week when no scheduler items exist', async () => {
    const hass = makeMockHass([]);
    const { week, ownedEntities } = await fetchWeekForClimate(hass, ENTITY, 'heat');
    expect(Object.values(week).every((d) => d.length === 0)).toBe(true);
    expect(ownedEntities).toEqual({});
  });

  it('includes modern mode-tagged items for the matching mode', async () => {
    const item = makeItem({ tags: [SCHEDULER_TAG, modeTag('heat')], hvacMode: 'heat', temp: 68 });
    const hass = makeMockHass([item]);
    const { week, ownedEntities } = await fetchWeekForClimate(hass, ENTITY, 'heat');
    expect(week.mon).toHaveLength(1);
    expect(week.mon[0].temp).toBe(68);
    expect(ownedEntities['switch.schedule_1']).toBeDefined();
  });

  it('excludes modern mode-tagged items for a different mode', async () => {
    const item = makeItem({ tags: [SCHEDULER_TAG, modeTag('cool')], hvacMode: 'cool', temp: 74 });
    const hass = makeMockHass([item]);
    const { week } = await fetchWeekForClimate(hass, ENTITY, 'heat');
    expect(Object.values(week).every((d) => d.length === 0)).toBe(true);
  });

  it('includes legacy (no mode tag) items bucketed by hvac_mode → heat', async () => {
    const item = makeItem({ tags: [SCHEDULER_TAG], hvacMode: 'heat', temp: 70 });
    const hass = makeMockHass([item]);
    const { week } = await fetchWeekForClimate(hass, ENTITY, 'heat');
    expect(week.mon).toHaveLength(1);
    expect(week.mon[0].temp).toBe(70);
  });

  it('excludes legacy items whose hvac_mode maps to a different bucket', async () => {
    const item = makeItem({ tags: [SCHEDULER_TAG], hvacMode: 'cool', temp: 74 });
    const hass = makeMockHass([item]);
    const { week } = await fetchWeekForClimate(hass, ENTITY, 'heat');
    expect(Object.values(week).every((d) => d.length === 0)).toBe(true);
  });

  it('includes legacy auto items in the heat_cool bucket', async () => {
    const item = makeItem({ tags: [SCHEDULER_TAG], hvacMode: 'auto', tempLow: 68, tempHigh: 76 });
    const hass = makeMockHass([item]);
    const { week } = await fetchWeekForClimate(hass, ENTITY, 'heat_cool');
    expect(week.mon).toHaveLength(1);
    expect(week.mon[0].tempLow).toBe(68);
    expect(week.mon[0].tempHigh).toBe(76);
  });

  it('skips items not targeting the climate entity', async () => {
    const item = makeItem({ tags: [SCHEDULER_TAG, modeTag('heat')], hvacMode: 'heat' });
    // Redirect action to a different entity
    (item.timeslots[0].actions[0] as { entity_id: string }).entity_id = 'climate.other';
    const hass = makeMockHass([item]);
    const { week } = await fetchWeekForClimate(hass, ENTITY, 'heat');
    expect(Object.values(week).every((d) => d.length === 0)).toBe(true);
  });

  it('skips items missing the base SCHEDULER_TAG', async () => {
    const item = makeItem({ tags: [modeTag('heat')], hvacMode: 'heat', temp: 68 });
    const hass = makeMockHass([item]);
    const { week } = await fetchWeekForClimate(hass, ENTITY, 'heat');
    expect(Object.values(week).every((d) => d.length === 0)).toBe(true);
  });
});

// ── writeWeek ───────────────────────────────────────────────────

describe('writeWeek', () => {
  let callService: Hass['callService'] & ReturnType<typeof vi.fn>;
  let hass: Hass;

  beforeEach(() => {
    callService = vi.fn().mockResolvedValue(undefined) as unknown as Hass['callService'] & ReturnType<typeof vi.fn>;
    hass = { states: {}, callWS: vi.fn() as unknown as Hass['callWS'], callService };
  });

  /** Minimal week with one setpoint on Monday */
  function singleSetpointWeek(_mode: 'heat' | 'cool', temp = 70) {
    return {
      sun: [], mon: [{ time: '07:00', temp }], tue: [], wed: [], thu: [], fri: [], sat: [],
    };
  }

  it('calls scheduler.add with both base and mode tags for heat', async () => {
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat',
      week: singleSetpointWeek('heat'),
      previousOwnedEntities: {},
    });
    expect(callService).toHaveBeenCalledOnce();
    const [domain, service, data] = callService.mock.calls[0];
    expect(domain).toBe('scheduler');
    expect(service).toBe('add');
    expect(data.tags).toContain(SCHEDULER_TAG);
    expect(data.tags).toContain(modeTag('heat'));
  });

  it('includes the mode in the entity name', async () => {
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'cool',
      week: singleSetpointWeek('cool'),
      previousOwnedEntities: {},
    });
    const [,, data] = callService.mock.calls[0];
    expect(data.name).toContain('cool');
    expect(data.name).toContain(ENTITY);
  });

  it('emits a single condition matching the heat state per timeslot', async () => {
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat',
      week: singleSetpointWeek('heat'),
      previousOwnedEntities: {},
    });
    const [,, data] = callService.mock.calls[0];
    const timeslot = data.timeslots[0];
    expect(timeslot.conditions).toHaveLength(1);
    expect(timeslot.conditions[0]).toEqual({ entity_id: ENTITY, value: 'heat', match_type: 'is' });
    expect(timeslot.condition_type).toBeUndefined();
  });

  it('emits a single condition matching the cool state per timeslot', async () => {
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'cool',
      week: singleSetpointWeek('cool'),
      previousOwnedEntities: {},
    });
    const [,, data] = callService.mock.calls[0];
    const timeslot = data.timeslots[0];
    expect(timeslot.conditions).toHaveLength(1);
    expect(timeslot.conditions[0]).toEqual({ entity_id: ENTITY, value: 'cool', match_type: 'is' });
  });

  it('emits two OR-conditions for heat_cool (heat_cool + auto)', async () => {
    const week = {
      sun: [], mon: [{ time: '07:00', tempLow: 68, tempHigh: 76 }],
      tue: [], wed: [], thu: [], fri: [], sat: [],
    };
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat_cool',
      week,
      previousOwnedEntities: {},
    });
    const [,, data] = callService.mock.calls[0];
    const timeslot = data.timeslots[0];
    expect(timeslot.conditions).toHaveLength(2);
    expect(timeslot.conditions[0]).toEqual({ entity_id: ENTITY, value: 'heat_cool', match_type: 'is' });
    expect(timeslot.conditions[1]).toEqual({ entity_id: ENTITY, value: 'auto', match_type: 'is' });
    expect(timeslot.condition_type).toBe('or');
  });

  it('omits hvac_mode from heat_cool timeslot service_data', async () => {
    const week = {
      sun: [], mon: [{ time: '07:00', tempLow: 68, tempHigh: 76 }],
      tue: [], wed: [], thu: [], fri: [], sat: [],
    };
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat_cool',
      week,
      previousOwnedEntities: {},
    });
    const [,, data] = callService.mock.calls[0];
    const serviceData = data.timeslots[0].actions[0].service_data;
    expect(serviceData.hvac_mode).toBeUndefined();
    expect(serviceData.target_temp_low).toBe(68);
    expect(serviceData.target_temp_high).toBe(76);
  });

  it('sets hvac_mode in heat timeslot service_data', async () => {
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat',
      week: singleSetpointWeek('heat', 70),
      previousOwnedEntities: {},
    });
    const [,, data] = callService.mock.calls[0];
    const serviceData = data.timeslots[0].actions[0].service_data;
    expect(serviceData.hvac_mode).toBe('heat');
    expect(serviceData.temperature).toBe(70);
  });

  it('uses scheduler.edit for existing entities and only removes stale ones from the same mode', async () => {
    const previousOwnedEntities = { 'switch.schedule_heat': ['mon'] };
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat',
      week: singleSetpointWeek('heat'),
      previousOwnedEntities,
    });
    // Should have called edit (not add) for the existing entity
    const editCall = callService.mock.calls.find(([, svc]) => svc === 'edit');
    expect(editCall).toBeDefined();
    expect(editCall![2].entity_id).toBe('switch.schedule_heat');
    // No remove for a different mode's entity
    const removeCall = callService.mock.calls.find(([, svc]) => svc === 'remove');
    expect(removeCall).toBeUndefined();
  });

  it('splits one grouped entity into edit+add when a single day diverges (copy-then-add repro)', async () => {
    // Mon–Thu identical; Fri has an extra setpoint. All 5 days previously lived in one entity.
    const sharedSetpoints = [{ time: '07:00', temp: 70 }];
    const week = {
      sun: [],
      mon: [...sharedSetpoints],
      tue: [...sharedSetpoints],
      wed: [...sharedSetpoints],
      thu: [...sharedSetpoints],
      fri: [...sharedSetpoints, { time: '18:00', temp: 65 }],
      sat: [],
    };
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat',
      week,
      previousOwnedEntities: { 'switch.schedule_monfri': ['mon', 'tue', 'wed', 'thu', 'fri'] },
    });

    const editCalls = callService.mock.calls.filter(([, svc]) => svc === 'edit');
    const addCalls  = callService.mock.calls.filter(([, svc]) => svc === 'add');

    // Exactly one edit (the Mon–Thu group reclaims the existing entity)
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0][2].entity_id).toBe('switch.schedule_monfri');
    expect(editCalls[0][2].weekdays).toEqual(expect.arrayContaining(['mon', 'tue', 'wed', 'thu']));
    expect(editCalls[0][2].weekdays).not.toContain('fri');

    // Exactly one add (the Fri group gets a new entity)
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][2].weekdays).toEqual(['fri']);

    // No remove — the original entity was reused, not discarded
    const removeCalls = callService.mock.calls.filter(([, svc]) => svc === 'remove');
    expect(removeCalls).toHaveLength(0);
  });

  it('removes stale owned entity when week becomes empty', async () => {
    const emptyWeek = {
      sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [],
    };
    await writeWeek({
      hass,
      climateEntityId: ENTITY,
      scheduleMode: 'heat',
      week: emptyWeek,
      previousOwnedEntities: { 'switch.schedule_heat': ['mon'] },
    });
    const removeCall = callService.mock.calls.find(([, svc]) => svc === 'remove');
    expect(removeCall).toBeDefined();
    expect(removeCall![2].entity_id).toBe('switch.schedule_heat');
  });
});

