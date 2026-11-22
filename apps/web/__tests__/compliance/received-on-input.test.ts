/**
 * The "Received or created on" date a manager picks, turned into the instant
 * the 30-day clock runs from (H-2). A date with no time is the LAST moment of
 * that day, so a posting on day 30 is never called late; today is now.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { receivedOnToIso, toDateInputValue } from '@/lib/compliance/received-on-input';

describe('receivedOnToIso', () => {
  const now = new Date(2026, 10, 21, 10, 30); // Nov 21, 10:30 in the test clock

  it('turns today into the current moment', () => {
    expect(receivedOnToIso(toDateInputValue(now), now)).toBe(now.toISOString());
  });

  it('turns an earlier date into the last moment of that day', () => {
    expect(receivedOnToIso('2026-11-03', now)).toBe(new Date(2026, 10, 3, 23, 59, 59, 999).toISOString());
  });

  it('refuses a future date, an empty value and an impossible date', () => {
    expect(receivedOnToIso('2026-11-22', now)).toBeNull();
    expect(receivedOnToIso('', now)).toBeNull();
    expect(receivedOnToIso('2026-02-30', now)).toBeNull();
    expect(receivedOnToIso('11/03/2026', now)).toBeNull();
  });
});

describe('toDateInputValue', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('formats the viewer\'s calendar day, zero-padded', () => {
    expect(toDateInputValue(new Date(2026, 0, 5, 23, 0))).toBe('2026-01-05');
  });
});
