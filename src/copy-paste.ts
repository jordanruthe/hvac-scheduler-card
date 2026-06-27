/**
 * copy-paste.ts
 *
 * Inline paste-target bar that appears after copying a day.
 * Dispatches 'paste-to-days' { sourceDays: DayKey[], targetDays: DayKey[] }
 * when the user confirms the paste.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { DAYS, DAY_SHORT, DayKey } from './const.js';

@customElement('copy-paste-bar')
export class CopyPasteBar extends LitElement {
  /** The day being copied; null means the bar is hidden */
  @property({ type: String }) copiedDay: DayKey | null = null;

  @state() private _selected = new Set<DayKey>();

  static override styles = css`
    :host { display: block; }

    .paste-bar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      padding: 10px 12px;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border-radius: 10px;
    }

    .paste-label {
      font-size: 0.82rem;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }

    .day-chip {
      padding: 4px 10px;
      border-radius: 14px;
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--divider-color, #ccc);
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      transition: background 0.12s;
      user-select: none;
    }

    .day-chip.selected {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }

    .day-chip.source {
      opacity: 0.4;
      cursor: default;
    }

    .btn-row {
      display: flex;
      gap: 6px;
      margin-left: auto;
    }

    button.btn {
      padding: 5px 14px;
      border-radius: 16px;
      border: none;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
    }

    button.btn-apply {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }

    button.btn-apply:disabled {
      opacity: 0.4;
      cursor: default;
    }

    button.btn-cancel {
      background: var(--secondary-background-color, #eee);
      color: var(--primary-text-color);
    }
  `;

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('copiedDay')) {
      // Reset selection when the source day changes
      this._selected = new Set();
    }
  }

  private _toggleDay(day: DayKey) {
    if (day === this.copiedDay) return; // can't paste onto source
    const next = new Set(this._selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    this._selected = next;
  }

  private _apply() {
    if (!this.copiedDay || this._selected.size === 0) return;
    this.dispatchEvent(new CustomEvent('paste-to-days', {
      detail: { sourceDay: this.copiedDay, targetDays: [...this._selected] },
      bubbles: true, composed: true,
    }));
    this._selected = new Set();
  }

  private _cancel() {
    this.dispatchEvent(new CustomEvent('copy-cancelled', { bubbles: true, composed: true }));
    this._selected = new Set();
  }

  override render() {
    if (!this.copiedDay) return nothing;

    return html`
      <div class="paste-bar">
        <span class="paste-label">Paste to:</span>

        ${DAYS.map(day => {
          const isSource = day === this.copiedDay;
          const isSelected = this._selected.has(day);
          return html`
            <span
              class="day-chip ${isSource ? 'source' : ''} ${isSelected ? 'selected' : ''}"
              @click=${() => this._toggleDay(day)}
              title=${isSource ? 'Source day' : `Paste to ${DAY_SHORT[day]}`}
            >${DAY_SHORT[day]}</span>
          `;
        })}

        <div class="btn-row">
          <button class="btn btn-cancel" @click=${this._cancel}>Cancel</button>
          <button class="btn btn-apply" ?disabled=${this._selected.size === 0} @click=${this._apply}>
            Apply
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'copy-paste-bar': CopyPasteBar;
  }
}
