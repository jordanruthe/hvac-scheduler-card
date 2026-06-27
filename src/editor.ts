/**
 * editor.ts
 *
 * GUI config editor for the hvac-scheduler-card shown in the Lovelace card picker.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { DEFAULT_MAX_TEMP, DEFAULT_MIN_TEMP, DEFAULT_STEP } from './const.js';

export interface HvacSchedulerCardConfig {
  type: string;
  /** climate.* entity id */
  entity: string;
  /** Optional card title override */
  name?: string;
  /** Min temperature (defaults to 60) */
  min_temp?: number;
  /** Max temperature (defaults to 90) */
  max_temp?: number;
  /** Temperature step (defaults to 1) */
  step?: number;
  /** Temperature unit override (auto-detected from HA if omitted) */
  temperature_unit?: string;
}

interface EditorHass {
  states: Record<string, { entity_id: string; attributes: Record<string, unknown> }>;
}

@customElement('hvac-scheduler-card-editor')
export class HvacSchedulerCardEditor extends LitElement {
  @property({ type: Object }) hass?: EditorHass;
  @property({ type: Object }) config?: HvacSchedulerCardConfig;

  static override styles = css`
    :host { display: block; padding: 4px 0; }

    .form { display: flex; flex-direction: column; gap: 12px; }

    .form-row { display: flex; flex-direction: column; gap: 4px; }

    label {
      font-size: 0.82rem;
      color: var(--secondary-text-color);
      font-weight: 500;
    }

    select, input[type="number"], input[type="text"] {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--divider-color, #ccc);
      border-radius: 6px;
      font-size: 0.9rem;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      box-sizing: border-box;
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

  `;

  setConfig(config: HvacSchedulerCardConfig) {
    this.config = config;
  }

  private _climateEntities(): string[] {
    if (!this.hass) return [];
    return Object.keys(this.hass.states).filter(e => e.startsWith('climate.'));
  }

  private _valueChanged(field: keyof HvacSchedulerCardConfig, value: unknown) {
    if (!this.config) return;
    const newConfig = { ...this.config, [field]: value };
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  override render() {
    if (!this.config) return html``;

    const entities = this._climateEntities();
    const cfg = this.config;

    return html`
      <div class="form">
        <div class="form-row">
          <label>Climate Entity</label>
          <select
            .value=${cfg.entity ?? ''}
            @change=${(e: Event) => this._valueChanged('entity', (e.target as HTMLSelectElement).value)}
          >
            <option value="">— select entity —</option>
            ${entities.map(e => html`<option value=${e} ?selected=${cfg.entity === e}>${e}</option>`)}
          </select>
        </div>

        <div class="form-row">
          <label>Card Name (optional)</label>
          <input
            type="text"
            .value=${cfg.name ?? ''}
            placeholder="HVAC Schedule"
            @input=${(e: Event) => this._valueChanged('name', (e.target as HTMLInputElement).value || undefined)}
          />
        </div>

        <div class="row-2">
          <div class="form-row">
            <label>Min Temp</label>
            <input
              type="number"
              .value=${String(cfg.min_temp ?? DEFAULT_MIN_TEMP)}
              @change=${(e: Event) => this._valueChanged('min_temp', Number((e.target as HTMLInputElement).value))}
            />
          </div>
          <div class="form-row">
            <label>Max Temp</label>
            <input
              type="number"
              .value=${String(cfg.max_temp ?? DEFAULT_MAX_TEMP)}
              @change=${(e: Event) => this._valueChanged('max_temp', Number((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>

        <div class="form-row">
          <label>Temperature Step</label>
          <input
            type="number"
            min="0.5"
            max="5"
            step="0.5"
            .value=${String(cfg.step ?? DEFAULT_STEP)}
            @change=${(e: Event) => this._valueChanged('step', Number((e.target as HTMLInputElement).value))}
          />
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hvac-scheduler-card-editor': HvacSchedulerCardEditor;
  }
}
