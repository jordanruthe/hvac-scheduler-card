/**
 * hvac-scheduler-card.ts
 *
 * Main entry point for the HVAC Scheduler Card.
 * A Nest-style weekly temperature scheduler Lovelace card.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import {
  CARD_TAG_NAME,
  CARD_NAME,
  CARD_VERSION,
  CARD_DESCRIPTION,
  DEFAULT_MIN_TEMP,
  DEFAULT_MAX_TEMP,
  DEFAULT_STEP,
  DEFAULT_UNIT,
  DayKey,
  ScheduleMode,
  SCHEDULE_MODES,
  SCHEDULE_MODE_LABELS,
  scheduleModeForDeviceMode,
} from './const.js';
import {
  WeekModel,
  Setpoint,
  emptyWeek,
  cloneSetpoints,
  sortedSetpoints,
  formatTemp,
} from './model.js';
import { fetchWeekForClimate, writeWeek, subscribeScheduleChanges, Hass } from './scheduler-api.js';
import type { HvacSchedulerCardConfig } from './editor.js';
import type { SetpointDialogConfig } from './setpoint-dialog.js';

// Side-effect imports for custom elements
import './week-grid.js';
import './setpoint-dialog.js';
import './copy-paste.js';
import './editor.js';

// ─── Register card with HA ───────────────────────────────────────
interface CustomWindow extends Window {
  customCards?: unknown[];
}
(window as CustomWindow).customCards = (window as CustomWindow).customCards ?? [];
((window as CustomWindow).customCards as unknown[]).push({
  type: CARD_TAG_NAME,
  name: CARD_NAME,
  description: CARD_DESCRIPTION,
  preview: true,
  documentationURL: 'https://github.com/your-repo/hvac-scheduler-card',
});

console.info(
  `%c HVAC-SCHEDULER-CARD %c v${CARD_VERSION} `,
  'color: white; background: #03a9f4; font-weight: bold;',
  'color: #03a9f4; background: white; font-weight: bold;',
);

// ─── Card ────────────────────────────────────────────────────────

@customElement(CARD_TAG_NAME)
export class HvacSchedulerCard extends LitElement {
  // `hass` is set by HA via property assignment; we use a backing field + setter
  // to react to it. Not using @property because LitElement doesn't declare `hass`.
  private _hass?: Hass;

  @state() private _config?: HvacSchedulerCardConfig;
  @state() private _week: WeekModel = emptyWeek();
  @state() private _ownedEntities: Record<string, string[]> = {};
  @state() private _dirty = false;
  @state() private _saving = false;
  @state() private _loading = false;
  @state() private _error: string | null = null;

  // Active schedule mode bucket being viewed/edited
  @state() private _activeMode: ScheduleMode = 'heat';

  // Dialog state
  @state() private _dialogOpen = false;
  @state() private _dialogConfig?: SetpointDialogConfig;

  // Copy/paste state
  @state() private _copiedDay: DayKey | null = null;

  // Track last loaded entity+mode to avoid redundant reloads
  private _loadedForEntity: string | null = null;
  private _loadedForMode: ScheduleMode | null = null;

  // Autosave
  private _autosaveTimer?: ReturnType<typeof setTimeout>;
  private _savePending = false;

  // Live scheduler subscription
  private _unsubscribeScheduler?: () => void;
  private _schedulerSubscribed = false;

  // ── Lifecycle ─────────────────────────────────────────────────

  override connectedCallback() {
    super.connectedCallback();
    // Re-subscribe if we were disconnected (e.g. card moved in the UI)
    if (this._hass) void this._subscribeToScheduler();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeScheduler?.();
    this._unsubscribeScheduler = undefined;
    this._schedulerSubscribed = false;
  }

  /**
   * Subscribe to external scheduler change events so the card reloads
   * automatically without a manual reload button.
   * Skips the reload if a local edit is in progress (dirty/saving/loading)
   * to avoid clobbering unsaved changes.
   */
  private async _subscribeToScheduler() {
    if (this._schedulerSubscribed || !this._hass) return;
    this._schedulerSubscribed = true;
    const unsub = await subscribeScheduleChanges(this._hass, () => {
      if (!this._hass || this._dirty || this._saving || this._loading) return;
      console.log('[hvac-scheduler] scheduler_updated event — reloading');
      void this._loadSchedule(this._hass);
    });
    this._unsubscribeScheduler = unsub;
  }

  // ── Lovelace API ──────────────────────────────────────────────

  setConfig(config: HvacSchedulerCardConfig) {
    if (!config.entity) {
      throw new Error('hvac-scheduler-card: "entity" (a climate entity_id) is required');
    }
    this._config = {
      min_temp: DEFAULT_MIN_TEMP,
      max_temp: DEFAULT_MAX_TEMP,
      step: DEFAULT_STEP,
      ...config,
    };
    console.log('[hvac-scheduler] setConfig called, entity=', config.entity, 'hass already set=', !!this._hass);
    // Sync _activeMode from live device state if hass is already available
    if (this._hass) {
      this._syncActiveModeFromDevice();
    }
    // If hass arrived before setConfig (can happen in HA), kick off the load now
    if (this._hass && !this._loading && !this._isLoadedForCurrentContext()) {
      void this._loadSchedule(this._hass);
    }
  }

  set hass(hass: Hass) {
    const prev = this._hass;
    this._hass = hass;

    const entity = this._config?.entity;
    console.log('[hvac-scheduler] hass set, entity=', entity, 'loadedFor=', this._loadedForEntity, 'mode=', this._activeMode, 'loading=', this._loading, 'config set=', !!this._config);

    // On the first hass assignment, sync active mode and subscribe to changes
    if (!prev && entity) {
      this._syncActiveModeFromDevice();
      void this._subscribeToScheduler();
    }

    if (entity && hass && !this._loading && !this._isLoadedForCurrentContext()) {
      void this._loadSchedule(hass);
    }

    // Detect hvac_mode change — follow the device and switch to the new mode's schedule
    if (prev && entity && prev.states[entity]?.state !== hass.states[entity]?.state) {
      const newDeviceMode = hass.states[entity]?.state;
      const newBucket = newDeviceMode ? scheduleModeForDeviceMode(newDeviceMode) : null;
      if (newBucket && newBucket !== this._activeMode) {
        this._activeMode = newBucket;
        if (!this._loading) {
          void this._loadSchedule(hass);
        }
      } else {
        this.requestUpdate();
      }
    }
  }

  get hass(): Hass {
    return this._hass!;
  }

  getCardSize(): number {
    return 5;
  }

  static getConfigElement() {
    return document.createElement('hvac-scheduler-card-editor');
  }

  static getStubConfig(): Partial<HvacSchedulerCardConfig> {
    return { entity: 'climate.thermostat' };
  }

  // ── Load ────────────────────────────────────────────────────────

  private async _loadSchedule(hass: Hass) {
    const entity = this._config?.entity;
    if (!entity) return;
    const mode = this._activeMode;
    this._loading = true;
    this._error = null;
    try {
      const { week, ownedEntities } = await fetchWeekForClimate(hass, entity, mode);
      this._week = week;
      this._ownedEntities = ownedEntities;
      this._loadedForEntity = entity;
      this._loadedForMode = mode;
      this._dirty = false;
    } catch (e) {
      this._error = `Failed to load schedule: ${(e as Error).message}`;
    } finally {
      this._loading = false;
    }
  }

  // ── Save ────────────────────────────────────────────────────────

  private _scheduleAutosave() {
    if (this._autosaveTimer !== undefined) clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => {
      this._autosaveTimer = undefined;
      void this._save();
    }, 600);
  }

  private async _save() {
    if (!this.hass || !this._config) return;
    if (this._saving) {
      // An in-flight save is already running; queue a follow-up flush
      this._savePending = true;
      return;
    }
    this._saving = true;
    this._error = null;
    try {
      await writeWeek({
        hass: this.hass,
        climateEntityId: this._config.entity,
        scheduleMode: this._activeMode,
        week: this._week,
        previousOwnedEntities: this._ownedEntities,
      });
      // Reload to get the updated entity ids from the scheduler
      await this._loadSchedule(this.hass);
      this._dirty = false;
    } catch (e) {
      this._error = `Save failed: ${(e as Error).message}`;
    } finally {
      this._saving = false;
      // Flush any change that arrived while we were saving
      if (this._savePending) {
        this._savePending = false;
        void this._save();
      }
    }
  }

  // ── Setpoint CRUD ───────────────────────────────────────────────

  private _openAddDialog(day: DayKey, defaultTime: string) {
    if (!this._config) return;
    const mode = this._activeMode;
    this._dialogConfig = {
      day,
      setpoint: { time: defaultTime } as Setpoint,
      isNew: true,
      hvacMode: mode,
      minTemp: this._config.min_temp ?? DEFAULT_MIN_TEMP,
      maxTemp: this._config.max_temp ?? DEFAULT_MAX_TEMP,
      step: this._config.step ?? DEFAULT_STEP,
      unit: this._unit(),
      // Single-element list hides the per-setpoint mode selector in the dialog
      availableModes: [mode],
    };
    this._dialogOpen = true;
  }

  private _openEditDialog(day: DayKey, setpoint: Setpoint) {
    if (!this._config) return;
    const mode = this._activeMode;
    this._dialogConfig = {
      day,
      setpoint,
      isNew: false,
      hvacMode: mode,
      minTemp: this._config.min_temp ?? DEFAULT_MIN_TEMP,
      maxTemp: this._config.max_temp ?? DEFAULT_MAX_TEMP,
      step: this._config.step ?? DEFAULT_STEP,
      unit: this._unit(),
      // Single-element list hides the per-setpoint mode selector in the dialog
      availableModes: [mode],
    };
    this._dialogOpen = true;
  }

  private _onSetpointSaved(e: CustomEvent) {
    const { day, setpoint, isNew, original } = e.detail as {
      day: DayKey;
      setpoint: Setpoint;
      isNew: boolean;
      original: Setpoint | null;
    };
    const daySetpoints = [...(this._week[day] ?? [])];
    if (isNew) {
      daySetpoints.push(setpoint);
    } else {
      const idx = original ? daySetpoints.findIndex(s => s.time === original.time) : -1;
      if (idx >= 0) daySetpoints[idx] = setpoint;
      else daySetpoints.push(setpoint); // fallback
    }
    this._week = { ...this._week, [day]: sortedSetpoints(daySetpoints) };
    this._dirty = true;
    this._dialogOpen = false;
    this._scheduleAutosave();
  }

  private _onSetpointCancelled() {
    this._dialogOpen = false;
  }

  private _onSetpointDeleted(e: CustomEvent) {
    const { day, setpoint } = e.detail as { day: DayKey; setpoint: Setpoint };
    const daySetpoints = (this._week[day] ?? []).filter(s => s.time !== setpoint.time);
    this._week = { ...this._week, [day]: daySetpoints };
    this._dirty = true;
    this._dialogOpen = false;
    this._scheduleAutosave();
  }

  // ── Copy / Paste ────────────────────────────────────────────────

  private _onCopyDay(e: CustomEvent) {
    const { day } = e.detail as { day: DayKey };
    this._copiedDay = this._copiedDay === day ? null : day;
  }

  private _onPasteToDays(e: CustomEvent) {
    const { sourceDay, targetDays } = e.detail as { sourceDay: DayKey; targetDays: DayKey[] };
    const source = cloneSetpoints(this._week[sourceDay] ?? []);
    const newWeek = { ...this._week };
    for (const day of targetDays) {
      newWeek[day] = cloneSetpoints(source);
    }
    this._week = newWeek;
    this._copiedDay = null;
    this._dirty = true;
    this._scheduleAutosave();
  }

  private _onCopyCancelled() {
    this._copiedDay = null;
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private _unit(): string {
    if (this._config?.temperature_unit) return this._config.temperature_unit;
    const entity = this._config?.entity;
    const attrs = entity ? this.hass?.states[entity]?.attributes : undefined;
    return (attrs?.temperature_unit as string | undefined) ?? DEFAULT_UNIT;
  }

  private _availableModes(): string[] {
    const entity = this._config?.entity;
    const attrs = entity ? this.hass?.states[entity]?.attributes : undefined;
    return (attrs?.hvac_modes as string[] | undefined) ?? ['heat', 'cool', 'heat_cool', 'off'];
  }

  /** The schedule mode buckets supported by this device (subset of SCHEDULE_MODES). */
  private _availableScheduleModes(): ScheduleMode[] {
    const deviceModes = this._availableModes();
    const buckets = new Set<ScheduleMode>();
    for (const m of deviceModes) {
      const bucket = scheduleModeForDeviceMode(m);
      if (bucket) buckets.add(bucket);
    }
    // Return in canonical order
    return SCHEDULE_MODES.filter((m) => buckets.has(m));
  }

  /** Whether the current entity+mode is already loaded (avoids redundant fetches). */
  private _isLoadedForCurrentContext(): boolean {
    return (
      this._loadedForEntity === this._config?.entity &&
      this._loadedForMode === this._activeMode
    );
  }

  /** Sync _activeMode to the device's current state without triggering a reload. */
  private _syncActiveModeFromDevice() {
    const entity = this._config?.entity;
    if (!entity || !this._hass) return;
    const deviceMode = this._hass.states[entity]?.state;
    const bucket = deviceMode ? scheduleModeForDeviceMode(deviceMode) : null;
    if (bucket) {
      this._activeMode = bucket;
    } else {
      // Device is off/dry/fan_only — keep whichever bucket is showing, or
      // pick the first available one so the UI is usable
      const available = this._availableScheduleModes();
      if (available.length > 0 && !available.includes(this._activeMode)) {
        this._activeMode = available[0];
      }
    }
  }

  /** Switch the displayed schedule mode; flush any pending save first. */
  private async _selectMode(mode: ScheduleMode) {
    if (mode === this._activeMode) return;
    if (this._dirty) {
      if (this._autosaveTimer !== undefined) {
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = undefined;
      }
      await this._save();
    }
    this._activeMode = mode;
    if (this._hass && !this._loading) {
      void this._loadSchedule(this._hass);
    }
  }


  // ── Styles ──────────────────────────────────────────────────────

  static override styles = css`
    :host { display: block; }

    ha-card { padding: 16px; overflow: hidden; }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .card-title {
      font-size: 1.05rem;
      font-weight: 500;
      color: var(--primary-text-color);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .mode-badge {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 10px;
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
      text-transform: capitalize;
    }

    .header-actions { display: flex; gap: 6px; align-items: center; }

    .status-msg {
      font-size: 0.78rem;
      font-weight: 500;
      padding: 3px 9px;
      border-radius: 10px;
    }

    .status-msg.saving {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }

    .status-msg.unsaved {
      background: var(--warning-color, orange);
      color: #fff;
    }

    .error-msg {
      color: var(--error-color, #f44336);
      font-size: 0.82rem;
      margin-bottom: 8px;
      padding: 6px 10px;
      background: rgba(244,67,54,0.08);
      border-radius: 6px;
    }

    .loading-msg {
      color: var(--secondary-text-color);
      font-size: 0.85rem;
      padding: 8px 0;
      text-align: center;
    }

    .mode-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
    }

    .mode-tab {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: 500;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      color: var(--primary-text-color);
      transition: background 0.15s, color 0.15s;
    }

    .mode-tab.active {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color, #03a9f4);
    }

    .mode-tab:disabled {
      opacity: 0.45;
      cursor: default;
    }

  `;

  // ── Render ──────────────────────────────────────────────────────

  override render() {
    if (!this._config) return nothing;

    const title = this._config.name ?? 'HVAC Schedule';
    const scheduleModes = this._availableScheduleModes();
    const activeMode = this._activeMode;

    return html`
      <ha-card>
        <!-- Header -->
        <div class="card-header">
          <div class="card-title">
            ${title}
            <span class="mode-badge">${SCHEDULE_MODE_LABELS[activeMode]}</span>
          </div>
          <div class="header-actions">
            ${this._saving
              ? html`<span class="status-msg saving">Saving…</span>`
              : this._dirty
                ? html`<span class="status-msg unsaved">Unsaved</span>`
                : nothing}
          </div>
        </div>

        <!-- Mode tabs -->
        ${scheduleModes.length > 1 ? html`
          <div class="mode-tabs">
            ${scheduleModes.map((m) => html`
              <button
                class="mode-tab ${m === activeMode ? 'active' : ''}"
                ?disabled=${this._loading || this._saving}
                @click=${() => this._selectMode(m)}
              >${SCHEDULE_MODE_LABELS[m]}</button>
            `)}
          </div>
        ` : nothing}

        ${this._error ? html`<div class="error-msg">${this._error}</div>` : nothing}
        ${this._loading ? html`<div class="loading-msg">Loading schedule…</div>` : nothing}

        <!-- Week grid -->
        <week-grid
          .week=${this._week}
          .minTemp=${this._config.min_temp ?? DEFAULT_MIN_TEMP}
          .maxTemp=${this._config.max_temp ?? DEFAULT_MAX_TEMP}
          .unit=${this._unit()}
          .hvacMode=${activeMode}
          .copiedDay=${this._copiedDay}
          @add-setpoint=${(e: CustomEvent) => this._openAddDialog(e.detail.day, e.detail.time)}
          @edit-setpoint=${(e: CustomEvent) => this._openEditDialog(e.detail.day, e.detail.setpoint)}
          @copy-day=${this._onCopyDay}
        ></week-grid>

        <!-- Copy/paste bar -->
        <copy-paste-bar
          .copiedDay=${this._copiedDay}
          @paste-to-days=${this._onPasteToDays}
          @copy-cancelled=${this._onCopyCancelled}
        ></copy-paste-bar>

        <!-- Setpoint dialog -->
        <setpoint-dialog
          .config=${this._dialogConfig}
          .open=${this._dialogOpen}
          @setpoint-saved=${this._onSetpointSaved}
          @setpoint-deleted=${this._onSetpointDeleted}
          @setpoint-cancelled=${this._onSetpointCancelled}
        ></setpoint-dialog>
      </ha-card>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [CARD_TAG_NAME]: HvacSchedulerCard;
  }
}
