import { DAYS, DayKey } from './const.js';

// ───────────────────────────── Types ──────────────────────────────

/** A single temperature setpoint within a day */
export interface Setpoint {
  /** 24-hour "HH:MM" */
  time: string;
  /** Optional hvac_mode override (e.g. "off", "heat", "cool", "heat_cool") */
  hvacMode?: string;
  /** Single target temp (heat / cool modes) */
  temp?: number;
  /** Low setpoint (heat_cool / auto modes) */
  tempLow?: number;
  /** High setpoint (heat_cool / auto modes) */
  tempHigh?: number;
}

/** The full week model — a per-day array of setpoints */
export type WeekModel = Record<DayKey, Setpoint[]>;

/** A group of days that share identical timeslots (maps to one scheduler entity) */
export interface DayGroup {
  weekdays: DayKey[];
  setpoints: Setpoint[];
  /** entity_id of the existing scheduler entity backing this group, if any */
  entityId?: string;
}

// ───────────────────────── Helpers ────────────────────────────────

/** Create an empty week model (no setpoints for any day) */
export function emptyWeek(): WeekModel {
  const entries = DAYS.reduce(
    (acc, d) => { acc[d] = []; return acc; },
    {} as WeekModel,
  );
  return entries;
}

/** Deep-clone a setpoint array */
export function cloneSetpoints(setpoints: Setpoint[]): Setpoint[] {
  return setpoints.map((s) => ({ ...s }));
}

/** Stable JSON key for comparing setpoint arrays */
function setpointsKey(setpoints: Setpoint[]): string {
  const sorted = [...setpoints].sort((a, b) => a.time.localeCompare(b.time));
  return JSON.stringify(sorted);
}

/**
 * Group days with identical setpoints together.
 * Days with zero setpoints are grouped separately but still emitted so existing
 * scheduler entities for those days can be removed.
 */
export function groupDaysByIdenticalSlots(week: WeekModel): DayGroup[] {
  const byKey = new Map<string, DayKey[]>();

  for (const day of DAYS) {
    const key = setpointsKey(week[day]);
    const existing = byKey.get(key);
    if (existing) {
      existing.push(day);
    } else {
      byKey.set(key, [day]);
    }
  }

  const groups: DayGroup[] = [];
  for (const [key, weekdays] of byKey) {
    const setpoints = JSON.parse(key) as Setpoint[];
    groups.push({ weekdays, setpoints });
  }
  return groups;
}

/**
 * Expand a list of scheduler-backed day groups back into a per-day WeekModel.
 * Days not covered by any group are given an empty setpoint array.
 */
export function expandGroupsToWeek(groups: DayGroup[]): WeekModel {
  const week = emptyWeek();
  for (const group of groups) {
    for (const day of group.weekdays) {
      week[day] = cloneSetpoints(group.setpoints);
    }
  }
  return week;
}

/**
 * Sort setpoints within a day by ascending time.
 */
export function sortedSetpoints(setpoints: Setpoint[]): Setpoint[] {
  return [...setpoints].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Compute a colour for a temperature circle from cold (blue) → hot (orange/red).
 * Returns a CSS hsl() string.
 * @param temp  the temperature value
 * @param min   configured minimum temperature
 * @param max   configured maximum temperature
 */
export function tempToColor(temp: number, min: number, max: number): string {
  const ratio = Math.max(0, Math.min(1, (temp - min) / (max - min)));
  // 220 = blue, 30 = orange, travel through green (120) in the middle
  const hue = Math.round(220 - ratio * 190);
  const sat = 70 + Math.round(ratio * 20);
  const lit = 45 + Math.round((1 - Math.abs(ratio - 0.5) * 2) * 10);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

// ── Internal helpers for adaptive text colour ──────────────────────

/** Convert HSL (h: 0–360, s: 0–100, l: 0–100) to linear [r, g, b] in [0, 1]. */
function _hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

/** WCAG relative luminance of an sRGB colour (channels in [0, 1]). */
function _relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Return a high-contrast text colour (dark or white) for a setpoint bubble
 * whose background is determined by `tempToColor(temp, min, max)`.
 * Works in both dark and light themes because the bubble colour is fixed.
 */
export function tempTextColor(temp: number, min: number, max: number): string {
  const ratio = Math.max(0, Math.min(1, (temp - min) / (max - min)));
  const hue = Math.round(220 - ratio * 190);
  const sat = 70 + Math.round(ratio * 20);
  const lit = 45 + Math.round((1 - Math.abs(ratio - 0.5) * 2) * 10);
  const [r, g, b] = _hslToRgb(hue, sat, lit);
  // Threshold ≈ 0.2 gives the crossover where dark vs white text both reach ~4.5:1
  return _relativeLuminance(r, g, b) > 0.2 ? '#1c1c1c' : '#fff';
}

/**
 * Format a temperature for display, rounding to the step precision.
 */
export function formatTemp(temp: number, unit: string): string {
  return `${Math.round(temp)}${unit}`;
}

/**
 * Convert "HH:MM" to minutes-since-midnight for position calculations.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert minutes-since-midnight to "HH:MM".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Given a pixel x-offset inside a timeline lane of given width,
 * snap to the nearest N-minute grid and return "HH:MM".
 */
export function pixelToTime(
  x: number,
  containerWidth: number,
  snapMinutes = 15
): string {
  const totalMinutes = Math.round((x / containerWidth) * 24 * 60 / snapMinutes) * snapMinutes;
  return minutesToTime(Math.max(0, Math.min(23 * 60 + 59, totalMinutes)));
}
