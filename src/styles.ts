import { css } from 'lit';

export const cardStyles = css`
  :host {
    display: block;
    font-family: var(--paper-font-body1_-_font-family, sans-serif);
  }

  ha-card {
    padding: 16px;
    overflow: hidden;
  }

  /* ─── Card Header ─── */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .card-title {
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--primary-text-color);
  }

  .header-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  /* ─── Toolbar ─── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
  }

  .btn-primary {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }

  .btn-secondary {
    background: var(--secondary-background-color, rgba(0,0,0,0.08));
    color: var(--primary-text-color);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .btn-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--secondary-background-color, rgba(0,0,0,0.06));
    border: none;
    cursor: pointer;
    color: var(--primary-text-color);
    transition: background 0.15s;
  }

  .btn-icon:hover {
    background: var(--divider-color, rgba(0,0,0,0.12));
  }

  /* ─── Timeline / Week Grid ─── */
  .week-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* hour tick marks row */
  .timeline-header {
    display: flex;
    margin-left: 50px; /* match day-label width */
    margin-bottom: 2px;
    position: relative;
    height: 16px;
  }

  .hour-tick {
    position: absolute;
    font-size: 0.65rem;
    color: var(--secondary-text-color);
    transform: translateX(-50%);
    user-select: none;
  }

  /* A single day row */
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
  }

  .copy-icon {
    font-size: 0.65rem;
    color: var(--secondary-text-color);
    margin-top: 1px;
  }

  .day-label-wrap.is-copied .day-label {
    color: var(--primary-color);
  }

  /* The actual timeline lane */
  .lane {
    position: relative;
    flex: 1;
    height: 36px;
    background: var(--secondary-background-color, rgba(0,0,0,0.05));
    border-radius: 18px;
    cursor: crosshair;
    overflow: visible;
  }

  .lane:hover {
    background: var(--divider-color, rgba(0,0,0,0.09));
  }

  /* Midnight line */
  .lane::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 60%;
    background: var(--divider-color, rgba(0,0,0,0.15));
    border-radius: 1px;
  }

  /* Noon line */
  .lane::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 1px;
    height: 60%;
    background: var(--divider-color, rgba(0,0,0,0.15));
    border-radius: 1px;
  }

  /* Temperature setpoint circle */
  .setpoint-circle {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    user-select: none;
    box-shadow: 0 2px 6px rgba(0,0,0,0.30);
    transition: transform 0.1s, box-shadow 0.1s;
    z-index: 1;
    border: 2px solid rgba(255,255,255,0.35);
    white-space: nowrap;
  }

  .setpoint-circle:hover {
    transform: translate(-50%, -50%) scale(1.12);
    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
    z-index: 2;
  }

  .setpoint-circle.dual {
    font-size: 0.58rem;
    flex-direction: column;
    gap: 0px;
    width: 42px;
    height: 42px;
  }

  /* Connector line between consecutive circles */
  .connector {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 3px;
    border-radius: 2px;
    opacity: 0.55;
    pointer-events: none;
  }

  /* ─── Paste chip bar ─── */
  .paste-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .paste-bar-label {
    font-size: 0.82rem;
    color: var(--secondary-text-color);
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
    transition: background 0.15s;
    user-select: none;
  }

  .day-chip.selected {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    border-color: var(--primary-color);
  }

  .day-chip:hover:not(.selected) {
    background: var(--secondary-background-color);
  }

  /* ─── Dialog (setpoint editor) ─── */
  .dialog-content {
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 280px;
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

  .temp-stepper {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .temp-value {
    font-size: 1.4rem;
    font-weight: 600;
    min-width: 64px;
    text-align: center;
    color: var(--primary-text-color);
  }

  .stepper-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--divider-color, #ccc);
    background: var(--secondary-background-color);
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-text-color);
    transition: background 0.1s;
  }

  .stepper-btn:hover {
    background: var(--divider-color);
  }

  .time-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--divider-color, #ccc);
    border-radius: 6px;
    font-size: 1rem;
    background: var(--card-background-color);
    color: var(--primary-text-color);
    box-sizing: border-box;
  }

  select.mode-select {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--divider-color, #ccc);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--card-background-color);
    color: var(--primary-text-color);
  }

  .delete-btn {
    color: var(--error-color, #f44336);
    background: none;
    border: 1px solid var(--error-color, #f44336);
    border-radius: 20px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 500;
    align-self: flex-start;
    margin-top: 4px;
  }

  .delete-btn:hover {
    background: var(--error-color, #f44336);
    color: #fff;
  }

  /* ─── Unsaved badge ─── */
  .unsaved-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning-color, orange);
    display: inline-block;
    margin-left: 4px;
  }

  /* ─── Responsive: mobile ─── */
  @media (max-width: 480px) {
    ha-card {
      padding: 10px;
    }

    .day-label {
      font-size: 0.7rem;
    }

    .day-label-wrap {
      width: 32px;
    }

    .timeline-header {
      margin-left: 38px;
    }

    .setpoint-circle {
      width: 30px;
      height: 30px;
      font-size: 0.62rem;
    }

    .setpoint-circle.dual {
      width: 36px;
      height: 36px;
    }

    .day-row {
      height: 40px;
    }

    .lane {
      height: 30px;
    }
  }
`;

export const dialogStyles = css`
  ha-dialog {
    --mdc-dialog-min-width: 320px;
    --mdc-dialog-max-width: 420px;
  }
`;
