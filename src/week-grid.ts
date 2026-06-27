/**
 * week-grid.ts
 *
 * Renders the 7-day weekly timeline grid.
 * Dispatches:
 *   'add-setpoint'  { day, time }
 *   'edit-setpoint' { day, setpoint }
 *   'copy-day'      { day }
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  DAYS,
  DAY_SHORT,
  DayKey,
  TIMELINE_HOUR_MARKS,
  DUAL_MODES,
} from './const.js';
import {
  Setpoint,
  WeekModel,
  sortedSetpoints,
  tempToColor,
  tempTextColor,
  formatTemp,
  timeToMinutes,
  pixelToTime,
} from './model.js';

@customElement('week-grid')
export class WeekGrid extends LitElement {
  @property({ type: Object }) week!: WeekModel;
  @property({ type: Number }) minTemp = 60;
  @property({ type: Number }) maxTemp = 90;
  @property({ type: String }) unit = '°F';
  @property({ type: String }) hvacMode = 'heat';
  /** The day that was most recently copied (for visual indicator) */
  @property({ type: String }) copiedDay: DayKey | null = null;

  static override styles = css`
    :host { display: block; }

    .week-grid { display: flex; flex-direction: column; gap: 4px; }

    .timeline-header {
      display: flex;
      margin-left: 50px;
      position: relative;
      height: 18px;
      margin-bottom: 2px;
    }

    .hour-tick {
      position: absolute;
      font-size: 0.63rem;
      color: var(--secondary-text-color, #888);
      transform: translateX(-50%);
      user-select: none;
    }

    .day-row {
      display: flex;
      align-items: center;
      height: 48px;
      gap: 6px;
    }

    .day-label-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      width: 44px;
      flex-shrink: 0;
      cursor: pointer;
      user-select: none;
    }

    .day-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--primary-text-color);
      line-height: 1.1;
    }

    .copy-hint {
      font-size: 0.58rem;
      color: var(--secondary-text-color, #aaa);
    }

    .day-label-wrap.is-copied .day-label {
      color: var(--primary-color, #03a9f4);
    }

    .lane {
      position: relative;
      flex: 1;
      height: 36px;
      background: var(--secondary-background-color, rgba(0,0,0,0.05));
      border-radius: 18px;
      cursor: crosshair;
      overflow: visible;
    }

    .lane:hover { background: var(--divider-color, rgba(0,0,0,0.09)); }

    .separator-line {
      position: absolute;
      top: 15%;
      height: 70%;
      width: 1px;
      background: var(--divider-color, rgba(0,0,0,0.13));
      border-radius: 1px;
      pointer-events: none;
    }

    .setpoint-circle {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 38px;
      height: 38px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 0.68rem;
      font-weight: 700;
      color: #fff;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 2px 6px rgba(0,0,0,0.28);
      transition: transform 0.1s, box-shadow 0.1s;
      z-index: 1;
      border: 2px solid rgba(255,255,255,0.3);
      line-height: 1.1;
    }

    .setpoint-circle:hover {
      transform: translate(-50%, -50%) scale(1.13);
      box-shadow: 0 4px 12px rgba(0,0,0,0.32);
      z-index: 2;
    }

    .setpoint-circle.dual {
      font-size: 0.58rem;
      width: 44px;
      height: 44px;
    }

    .circle-time {
      font-size: 0.52rem;
      font-weight: 400;
      opacity: 0.85;
      margin-top: 1px;
    }

    @media (max-width: 480px) {
      .day-label-wrap { width: 30px; }
      .day-label { font-size: 0.68rem; }
      .copy-hint { display: none; }
      .timeline-header { margin-left: 36px; }
      .setpoint-circle { width: 32px; height: 32px; font-size: 0.62rem; }
      .setpoint-circle.dual { width: 38px; height: 38px; }
      .day-row { height: 44px; }
      .lane { height: 32px; }
    }
  `;

  /**
   * Convert a 0–1 time fraction to a `left` CSS value with edge inset so
   * bubbles at 00:00 and end-of-day never overflow outside the lane.
   * 22px ≈ half the 38px bubble + a few px breathing room.
   */
  private _timePct(frac: number): string {
    return `calc(22px + (100% - 44px) * ${frac.toFixed(5)})`;
  }

  private _onLaneClick(day: DayKey, e: MouseEvent) {
    // Don't fire if they clicked a circle
    if ((e.target as Element).classList.contains('setpoint-circle')) return;
    const lane = (e.currentTarget as HTMLElement);
    const rect = lane.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelToTime(x, rect.width, 15);
    this.dispatchEvent(new CustomEvent('add-setpoint', {
      detail: { day, time },
      bubbles: true, composed: true,
    }));
  }

  private _onCircleClick(day: DayKey, setpoint: Setpoint, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('edit-setpoint', {
      detail: { day, setpoint },
      bubbles: true, composed: true,
    }));
  }

  private _onCopyDay(day: DayKey, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('copy-day', {
      detail: { day },
      bubbles: true, composed: true,
    }));
  }

  private _circleColor(sp: Setpoint): string {
    const isDual = DUAL_MODES.has(sp.hvacMode ?? this.hvacMode);
    if (isDual && sp.tempLow != null && sp.tempHigh != null) {
      return tempToColor((sp.tempLow + sp.tempHigh) / 2, this.minTemp, this.maxTemp);
    }
    return tempToColor(sp.temp ?? (this.minTemp + this.maxTemp) / 2, this.minTemp, this.maxTemp);
  }

  private _textColor(sp: Setpoint): string {
    const isDual = DUAL_MODES.has(sp.hvacMode ?? this.hvacMode);
    const temp = isDual && sp.tempLow != null && sp.tempHigh != null
      ? (sp.tempLow + sp.tempHigh) / 2
      : (sp.temp ?? (this.minTemp + this.maxTemp) / 2);
    return tempTextColor(temp, this.minTemp, this.maxTemp);
  }

  private _circleLabel(sp: Setpoint): { line1: string; line2?: string } {
    const isDual = DUAL_MODES.has(sp.hvacMode ?? this.hvacMode);
    if (isDual && sp.tempLow != null && sp.tempHigh != null) {
      return { line1: formatTemp(sp.tempHigh, ''), line2: formatTemp(sp.tempLow, '') + this.unit };
    }
    return { line1: formatTemp(sp.temp ?? 0, this.unit) };
  }

  override render() {
    return html`
      <div class="week-grid">
        <!-- Hour tick header -->
        <div class="timeline-header">
          ${TIMELINE_HOUR_MARKS.map(h => {
            const frac = h / 24;
            const label = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
            return html`<span class="hour-tick" style="left:${this._timePct(frac)}">${label}</span>`;
          })}
        </div>

        ${DAYS.map(day => this._renderDayRow(day))}
      </div>
    `;
  }

  private _renderDayRow(day: DayKey) {
    const setpoints = sortedSetpoints(this.week[day] ?? []);
    const isCopied = this.copiedDay === day;

    return html`
      <div class="day-row">
        <!-- Day label (click = copy) -->
        <div
          class="day-label-wrap ${isCopied ? 'is-copied' : ''}"
          @click=${(e: Event) => this._onCopyDay(day, e)}
          title="Click to copy ${day}"
        >
          <span class="day-label">${DAY_SHORT[day]}</span>
          <span class="copy-hint">${isCopied ? '✓ copied' : 'copy'}</span>
        </div>

        <!-- Timeline lane -->
        <div class="lane" @click=${(e: MouseEvent) => this._onLaneClick(day, e)}>
          <!-- Separator lines at 3-hour intervals -->
          ${[3, 6, 9, 12, 15, 18, 21].map(h => html`
            <div class="separator-line" style="left:${this._timePct(h / 24)}"></div>
          `)}

          <!-- Setpoint circles -->
          ${setpoints.map(sp => this._renderCircle(day, sp))}
        </div>
      </div>
    `;
  }

  private _renderCircle(day: DayKey, sp: Setpoint) {
    const isDual = DUAL_MODES.has(sp.hvacMode ?? this.hvacMode);
    const frac = timeToMinutes(sp.time) / (24 * 60);
    const color = this._circleColor(sp);
    const textColor = this._textColor(sp);
    const label = this._circleLabel(sp);

    return html`
      <div
        class="setpoint-circle ${isDual ? 'dual' : ''}"
        style=${styleMap({ left: this._timePct(frac), background: color, color: textColor })}
        @click=${(e: Event) => this._onCircleClick(day, sp, e)}
        title="${sp.time} — ${isDual
          ? `${formatTemp(sp.tempLow!, this.unit)} / ${formatTemp(sp.tempHigh!, this.unit)}`
          : formatTemp(sp.temp!, this.unit)
        }"
      >
        <span>${label.line1}</span>
        ${label.line2 ? html`<span>${label.line2}</span>` : nothing}
        <span class="circle-time">${sp.time}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'week-grid': WeekGrid;
  }
}
