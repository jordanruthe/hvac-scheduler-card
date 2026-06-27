/**
 * setpoint-dialog.ts
 *
 * Modal dialog for adding or editing a setpoint.
 * Dispatches 'setpoint-saved' or 'setpoint-deleted' custom events.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { DUAL_MODES, DayKey, DAY_LABELS, DEFAULT_STEP } from './const.js';
import { Setpoint, formatTemp } from './model.js';

export interface SetpointDialogConfig {
  day: DayKey;
  setpoint: Setpoint | null; // null = adding new
  isNew: boolean;
  hvacMode: string;         // current climate hvac_mode
  minTemp: number;
  maxTemp: number;
  step: number;
  unit: string;
  /** Available hvac modes from the climate entity */
  availableModes: string[];
}

@customElement('setpoint-dialog')
export class SetpointDialog extends LitElement {
  @property({ type: Object }) config?: SetpointDialogConfig;
  @property({ type: Boolean }) open = false;

  @state() private _time = '08:00';
  @state() private _temp = 70;
  @state() private _tempLow = 65;
  @state() private _tempHigh = 75;
  @state() private _hvacMode = '';

  static override styles = css`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog-box {
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      border-radius: 12px;
      padding: 20px 24px;
      min-width: 300px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.28);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .dialog-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .form-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-label {
      font-size: 0.82rem;
      color: var(--secondary-text-color);
      font-weight: 500;
    }

    .time-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--divider-color, #ccc);
      border-radius: 6px;
      font-size: 1rem;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      box-sizing: border-box;
    }

    .temp-stepper {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .temp-value {
      font-size: 1.3rem;
      font-weight: 600;
      min-width: 60px;
      text-align: center;
    }

    .stepper-btn {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid var(--divider-color, #ccc);
      background: var(--secondary-background-color, #f5f5f5);
      cursor: pointer;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary-text-color);
    }

    .stepper-btn:hover { background: var(--divider-color, #e0e0e0); }

    select.mode-select {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--divider-color, #ccc);
      border-radius: 6px;
      font-size: 0.9rem;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
    }

    .dialog-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .btn-row {
      display: flex;
      gap: 8px;
    }

    button.btn {
      padding: 7px 16px;
      border-radius: 20px;
      border: none;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
    }

    button.btn-primary {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }

    button.btn-cancel {
      background: var(--secondary-background-color, #eee);
      color: var(--primary-text-color);
    }

    button.btn-delete {
      background: none;
      border: 1px solid var(--error-color, #f44336);
      color: var(--error-color, #f44336);
      padding: 6px 14px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: 500;
    }

    button.btn-delete:hover {
      background: var(--error-color, #f44336);
      color: #fff;
    }
  `;

  override willUpdate(changedProps: Map<string, unknown>) {
    if (changedProps.has('config') && this.config) {
      const cfg = this.config;
      const sp = cfg.setpoint;
      this._time = sp?.time ?? '08:00';
      this._hvacMode = sp?.hvacMode ?? cfg.hvacMode ?? '';
      const isDual = DUAL_MODES.has(this._hvacMode);
      if (isDual) {
        this._tempLow = sp?.tempLow ?? cfg.minTemp + Math.round((cfg.maxTemp - cfg.minTemp) * 0.3);
        this._tempHigh = sp?.tempHigh ?? cfg.minTemp + Math.round((cfg.maxTemp - cfg.minTemp) * 0.7);
      } else {
        this._temp = sp?.temp ?? Math.round((cfg.minTemp + cfg.maxTemp) / 2);
      }
    }
  }

  private _isDual(): boolean {
    return DUAL_MODES.has(this._hvacMode || this.config?.hvacMode || '');
  }

  private _clampTemp(val: number): number {
    const cfg = this.config!;
    return Math.max(cfg.minTemp, Math.min(cfg.maxTemp, val));
  }

  private _step(field: 'temp' | 'low' | 'high', delta: number) {
    const step = this.config?.step ?? DEFAULT_STEP;
    if (field === 'temp') this._temp = this._clampTemp(this._temp + delta * step);
    else if (field === 'low') this._tempLow = this._clampTemp(this._tempLow + delta * step);
    else this._tempHigh = this._clampTemp(this._tempHigh + delta * step);
  }

  private _save() {
    if (!this.config) return;
    const isDual = this._isDual();
    const setpoint: Setpoint = {
      time: this._time,
      hvacMode: this._hvacMode || undefined,
    };
    if (isDual) {
      setpoint.tempLow = this._tempLow;
      setpoint.tempHigh = this._tempHigh;
    } else {
      setpoint.temp = this._temp;
    }
    this.dispatchEvent(new CustomEvent('setpoint-saved', {
      detail: { day: this.config.day, setpoint, isNew: this.config.isNew, original: this.config.setpoint },
      bubbles: true, composed: true,
    }));
  }

  private _delete() {
    if (!this.config) return;
    this.dispatchEvent(new CustomEvent('setpoint-deleted', {
      detail: { day: this.config.day, setpoint: this.config.setpoint },
      bubbles: true, composed: true,
    }));
  }

  private _cancel() {
    this.dispatchEvent(new CustomEvent('setpoint-cancelled', {
      bubbles: true, composed: true,
    }));
  }

  override render() {
    if (!this.open || !this.config) return html``;
    const cfg = this.config;
    const isDual = this._isDual();

    return html`
      <div class="dialog-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this._cancel(); }}>
        <div class="dialog-box">
          <div class="dialog-title">
            ${cfg.isNew ? 'Add setpoint' : 'Edit setpoint'} — ${DAY_LABELS[cfg.day]}
          </div>

          <div class="form-row">
            <div class="form-label">Time</div>
            <input
              type="time"
              class="time-input"
              .value=${this._time}
              @change=${(e: Event) => { this._time = (e.target as HTMLInputElement).value; }}
            />
          </div>

          ${cfg.availableModes.length > 1 ? html`
            <div class="form-row">
              <div class="form-label">HVAC Mode (optional)</div>
              <select class="mode-select" .value=${this._hvacMode}
                @change=${(e: Event) => { this._hvacMode = (e.target as HTMLSelectElement).value; }}>
                <option value="">— keep current mode —</option>
                ${cfg.availableModes.map(m => html`<option value=${m} ?selected=${this._hvacMode === m}>${m}</option>`)}
              </select>
            </div>
          ` : ''}

          ${isDual ? html`
            <div class="form-row">
              <div class="form-label">Heat setpoint</div>
              <div class="temp-stepper">
                <button class="stepper-btn" @click=${() => this._step('low', -1)}>−</button>
                <span class="temp-value">${formatTemp(this._tempLow, cfg.unit)}</span>
                <button class="stepper-btn" @click=${() => this._step('low', 1)}>+</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">Cool setpoint</div>
              <div class="temp-stepper">
                <button class="stepper-btn" @click=${() => this._step('high', -1)}>−</button>
                <span class="temp-value">${formatTemp(this._tempHigh, cfg.unit)}</span>
                <button class="stepper-btn" @click=${() => this._step('high', 1)}>+</button>
              </div>
            </div>
          ` : html`
            <div class="form-row">
              <div class="form-label">Temperature</div>
              <div class="temp-stepper">
                <button class="stepper-btn" @click=${() => this._step('temp', -1)}>−</button>
                <span class="temp-value">${formatTemp(this._temp, cfg.unit)}</span>
                <button class="stepper-btn" @click=${() => this._step('temp', 1)}>+</button>
              </div>
            </div>
          `}

          <div class="dialog-actions">
            ${!cfg.isNew ? html`
              <button class="btn-delete" @click=${this._delete}>Delete</button>
            ` : html`<span></span>`}
            <div class="btn-row">
              <button class="btn btn-cancel" @click=${this._cancel}>Cancel</button>
              <button class="btn btn-primary" @click=${this._save}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'setpoint-dialog': SetpointDialog;
  }
}
