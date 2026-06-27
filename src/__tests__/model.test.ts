import { describe, it, expect } from 'vitest';
import {
  emptyWeek,
  groupDaysByIdenticalSlots,
  expandGroupsToWeek,
  cloneSetpoints,
  sortedSetpoints,
  tempToColor,
  timeToMinutes,
  minutesToTime,
  pixelToTime,
  type Setpoint,
  type WeekModel,
} from '../model.js';
import { DAYS } from '../const.js';

// ── emptyWeek ────────────────────────────────────────────────────

describe('emptyWeek', () => {
  it('produces all 7 days with empty arrays', () => {
    const week = emptyWeek();
    for (const day of DAYS) {
      expect(week[day]).toEqual([]);
    }
  });
});

// ── groupDaysByIdenticalSlots ────────────────────────────────────

describe('groupDaysByIdenticalSlots', () => {
  it('groups all-empty days into one group', () => {
    const week = emptyWeek();
    const groups = groupDaysByIdenticalSlots(week);
    expect(groups).toHaveLength(1);
    expect(groups[0].weekdays).toHaveLength(7);
    expect(groups[0].setpoints).toEqual([]);
  });

  it('separates days with different setpoints', () => {
    const week = emptyWeek();
    week.mon = [{ time: '08:00', temp: 70 }];
    week.tue = [{ time: '08:00', temp: 70 }];
    week.sat = [{ time: '09:00', temp: 65 }];
    week.sun = [{ time: '09:00', temp: 65 }];

    const groups = groupDaysByIdenticalSlots(week);
    // 3 groups: mon+tue, sat+sun, and the remaining 3 empty weekdays
    expect(groups).toHaveLength(3);

    const monTue = groups.find(g => g.weekdays.includes('mon') && g.weekdays.includes('tue'));
    expect(monTue).toBeDefined();
    expect(monTue!.weekdays.sort()).toEqual(['mon', 'tue']);

    const satSun = groups.find(g => g.weekdays.includes('sat') && g.weekdays.includes('sun'));
    expect(satSun).toBeDefined();
    expect(satSun!.weekdays.sort()).toEqual(['sat', 'sun']);
  });

  it('keeps days with unique setpoints in their own group', () => {
    const week = emptyWeek();
    week.mon = [{ time: '07:00', temp: 72 }];
    week.tue = [{ time: '08:00', temp: 72 }]; // different time
    const groups = groupDaysByIdenticalSlots(week);
    const monGroup = groups.find(g => g.weekdays.includes('mon'));
    const tueGroup = groups.find(g => g.weekdays.includes('tue'));
    expect(monGroup).not.toBe(tueGroup);
  });
});

// ── expandGroupsToWeek ───────────────────────────────────────────

describe('expandGroupsToWeek', () => {
  it('round-trips through group → expand', () => {
    const original: WeekModel = {
      ...emptyWeek(),
      mon: [{ time: '07:00', temp: 70 }],
      tue: [{ time: '07:00', temp: 70 }],
      sat: [{ time: '09:00', temp: 65 }],
      sun: [{ time: '09:00', temp: 65 }],
    };
    const groups = groupDaysByIdenticalSlots(original);
    const restored = expandGroupsToWeek(groups);

    for (const day of DAYS) {
      expect(sortedSetpoints(restored[day])).toEqual(sortedSetpoints(original[day]));
    }
  });

  it('leaves days not covered by any group as empty arrays', () => {
    const week = expandGroupsToWeek([
      { weekdays: ['mon', 'tue'], setpoints: [{ time: '08:00', temp: 70 }] },
    ]);
    expect(week.wed).toEqual([]);
    expect(week.sat).toEqual([]);
  });
});

// ── cloneSetpoints ───────────────────────────────────────────────

describe('cloneSetpoints', () => {
  it('produces a deep-equal but not reference-equal copy', () => {
    const sp: Setpoint[] = [{ time: '08:00', temp: 70 }, { time: '20:00', temp: 65 }];
    const clone = cloneSetpoints(sp);
    expect(clone).toEqual(sp);
    expect(clone).not.toBe(sp);
    expect(clone[0]).not.toBe(sp[0]);
  });
});

// ── sortedSetpoints ──────────────────────────────────────────────

describe('sortedSetpoints', () => {
  it('sorts by time ascending', () => {
    const sp: Setpoint[] = [
      { time: '20:00', temp: 65 },
      { time: '06:00', temp: 68 },
      { time: '08:00', temp: 72 },
    ];
    const sorted = sortedSetpoints(sp);
    expect(sorted.map(s => s.time)).toEqual(['06:00', '08:00', '20:00']);
  });
});

// ── tempToColor ──────────────────────────────────────────────────

describe('tempToColor', () => {
  it('returns a CSS hsl string', () => {
    const color = tempToColor(70, 60, 90);
    expect(color).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  it('is cool-hued at min temp and warm-hued at max', () => {
    const cold = tempToColor(60, 60, 90); // ratio=0 → hue=220 (blue)
    const hot = tempToColor(90, 60, 90);  // ratio=1 → hue=30  (orange)
    const coldHue = parseInt(cold.match(/hsl\((\d+)/)![1]);
    const hotHue = parseInt(hot.match(/hsl\((\d+)/)![1]);
    expect(coldHue).toBeGreaterThan(hotHue);
  });

  it('clamps out-of-range temperatures', () => {
    expect(tempToColor(50, 60, 90)).toEqual(tempToColor(60, 60, 90));
    expect(tempToColor(100, 60, 90)).toEqual(tempToColor(90, 60, 90));
  });
});

// ── timeToMinutes / minutesToTime ────────────────────────────────

describe('timeToMinutes', () => {
  it('converts HH:MM to total minutes', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('01:30')).toBe(90);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('minutesToTime', () => {
  it('converts total minutes to HH:MM', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(90)).toBe('01:30');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('is inverse of timeToMinutes', () => {
    const times = ['00:00', '08:30', '12:00', '23:45'];
    for (const t of times) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });
});

// ── pixelToTime ──────────────────────────────────────────────────

describe('pixelToTime', () => {
  it('maps 0px to 00:00', () => {
    expect(pixelToTime(0, 1000, 15)).toBe('00:00');
  });

  it('maps midpoint to 12:00', () => {
    expect(pixelToTime(500, 1000, 15)).toBe('12:00');
  });

  it('snaps to 15-minute grid', () => {
    // 3px / 1000 = 4.32 min → nearer to 0 → '00:00'
    expect(pixelToTime(3, 1000, 15)).toBe('00:00');
    // 7px / 1000 = 10.08 min → nearer to 15 → '00:15'
    expect(pixelToTime(7, 1000, 15)).toBe('00:15');
  });

  it('clamps to 23:59 at the right edge', () => {
    // 1000/1000 = 1440 min → clamped to 23*60+59 = 1439 → '23:59'
    const t = pixelToTime(1000, 1000, 15);
    expect(t).toBe('23:59');
  });
});
