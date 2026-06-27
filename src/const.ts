export const CARD_VERSION = '0.0.1';
export const CARD_TAG_NAME = 'hvac-scheduler-card';
export const CARD_NAME = 'HVAC Scheduler Card';
export const CARD_DESCRIPTION = 'Nest-style weekly temperature scheduler card';

/** The ownership tag placed on all scheduler entities created by this card */
export const SCHEDULER_TAG = 'hvac-scheduler-card';

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export const DAY_SHORT: Record<DayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

/** Hours to show on the timeline x-axis labels */
export const TIMELINE_HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21];

/** Min/max defaults if not configured */
export const DEFAULT_MIN_TEMP = 60;
export const DEFAULT_MAX_TEMP = 90;
export const DEFAULT_STEP = 1;
export const DEFAULT_UNIT = '°F';

/** Dual setpoint mode identifiers */
export const DUAL_MODES = new Set(['heat_cool', 'auto']);

// ─── Per-mode schedule buckets ────────────────────────────────────

/** The three independent schedule buckets the card manages */
export type ScheduleMode = 'heat' | 'cool' | 'heat_cool';

export const SCHEDULE_MODES: ScheduleMode[] = ['heat', 'cool', 'heat_cool'];

export const SCHEDULE_MODE_LABELS: Record<ScheduleMode, string> = {
  heat: 'Heat',
  cool: 'Cool',
  heat_cool: 'Heat·Cool',
};

/** Per-mode ownership tag layered on top of SCHEDULER_TAG */
export function modeTag(mode: ScheduleMode): string {
  return `${SCHEDULER_TAG}:${mode}`;
}

/**
 * Map a climate entity state to the corresponding schedule bucket.
 * Returns null for modes that have no schedule (off, dry, fan_only, …).
 */
export function scheduleModeForDeviceMode(state: string): ScheduleMode | null {
  switch (state) {
    case 'heat': return 'heat';
    case 'cool': return 'cool';
    case 'heat_cool':
    case 'auto': return 'heat_cool';
    default: return null;
  }
}
