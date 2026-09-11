import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PLATFORM_TIME_ZONE,
  formatPlatformDate,
  greetingFor,
  platformHour,
} from '@/lib/utils/platform-clock';

/**
 * The defect: the dashboard's greeting and date were computed in the SERVER's
 * local zone, which on Vercel is UTC. 2026-09-11T01:00Z is 21:00 EDT on
 * Thursday the 10th — so the operator read "Good morning · Friday, September
 * 11" on Thursday evening.
 *
 * Every case below runs under `TZ` as the test runner found it, so the
 * assertions must hold with the process zone set to UTC (how CI runs) — that is
 * the whole point. `vi.setSystemTime` fixes the instant; nothing here depends on
 * the wall clock.
 */
const EVENING_IN_FLORIDA = new Date('2026-09-11T01:00:00Z'); // 21:00 EDT, Thu Sep 10
const MORNING_IN_FLORIDA = new Date('2026-09-10T13:30:00Z'); // 09:30 EDT, Thu Sep 10
const AFTERNOON_IN_FLORIDA = new Date('2026-09-10T18:00:00Z'); // 14:00 EDT, Thu Sep 10

describe('platform clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is Florida', () => {
    expect(PLATFORM_TIME_ZONE).toBe('America/New_York');
  });

  it('reads the hour in the platform zone, not the process zone', () => {
    vi.setSystemTime(EVENING_IN_FLORIDA);
    const now = new Date();

    expect(platformHour(now)).toBe(21);
    // Anti-vacuity: the old code read this value instead, and it differs. If
    // the test process were somehow already running in Eastern, these two would
    // match and the case above would prove nothing.
    expect(now.getUTCHours()).toBe(1);
    expect(platformHour(now)).not.toBe(now.getUTCHours());
  });

  it('greets an evening UTC instant as evening', () => {
    vi.setSystemTime(EVENING_IN_FLORIDA);
    expect(greetingFor(new Date())).toBe('Good evening');
  });

  it('still greets morning and afternoon correctly', () => {
    vi.setSystemTime(MORNING_IN_FLORIDA);
    expect(greetingFor(new Date())).toBe('Good morning');
    vi.setSystemTime(AFTERNOON_IN_FLORIDA);
    expect(greetingFor(new Date())).toBe('Good afternoon');
  });

  it('renders the platform calendar day, not the UTC one that has already rolled over', () => {
    vi.setSystemTime(EVENING_IN_FLORIDA);
    const now = new Date();

    expect(formatPlatformDate(now)).toBe('Thursday, September 10');
    // The value the unzoned formatter produced, spelled out so the defect is
    // visible in the test rather than only in the fix.
    expect(
      new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(now),
    ).toBe('Friday, September 11');
  });

  it('crosses the EST/EDT boundary without a hand-rolled offset', () => {
    // 2026-01-15T01:00Z is 20:00 EST on the 14th — a 5-hour offset, where the
    // September cases are 4. A fixed `-4` would render "Thursday, January 15".
    vi.setSystemTime(new Date('2026-01-15T01:00:00Z'));
    const now = new Date();

    expect(platformHour(now)).toBe(20);
    expect(formatPlatformDate(now)).toBe('Wednesday, January 14');
  });
});
