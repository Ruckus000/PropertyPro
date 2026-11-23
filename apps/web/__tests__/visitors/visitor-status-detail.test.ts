/**
 * The line under a visitor's status on the staff list. It replaced four
 * columns (Expected Arrival, Checked In, Checked Out, Duration), so each status
 * must still say the time a guard would have read from them.
 */
import { describe, expect, it } from 'vitest';
import { visitorStatusDetail } from '../../src/components/visitors/visitor-columns';
import type { VisitorListItem } from '../../src/hooks/use-visitors';

/** Local times, so the formatted hour does not depend on the machine's zone. */
function at(hour: number, minute = 0, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
const NOON = new Date(at(12));
const HOUR = 3_600_000;
/** Status is derived against the real clock, so its inputs are relative to it. */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

function visitor(overrides: Partial<VisitorListItem> = {}): VisitorListItem {
  return {
    id: 1,
    communityId: 1,
    visitorName: 'Ana Ruiz',
    purpose: 'Dinner',
    hostUnitId: 3,
    hostUnitLabel: '3A',
    hostUserId: null,
    expectedArrival: at(14, 30),
    checkedInAt: null,
    checkedOutAt: null,
    staffUserId: null,
    notes: null,
    guestType: 'one_time',
    validFrom: null,
    validUntil: null,
    recurrenceRule: null,
    expectedDurationMinutes: null,
    vehicleMake: null,
    vehicleModel: null,
    vehicleColor: null,
    vehiclePlate: null,
    revokedByUserId: null,
    revokedAt: null,
    createdAt: at(8),
    updatedAt: at(8),
    ...overrides,
  };
}

describe('visitorStatusDetail', () => {
  it('expected: the arrival time, and the stay when one was given', () => {
    expect(visitorStatusDetail(visitor(), NOON)).toBe('2:30 PM');
    expect(visitorStatusDetail(visitor({ expectedDurationMinutes: 120 }), NOON)).toBe(
      '2:30 PM · 2h stay',
    );
  });

  it('expected on another day carries the date', () => {
    const detail = visitorStatusDetail(visitor({ expectedArrival: at(14, 30, 2) }), NOON);
    expect(detail).toMatch(/^[A-Z][a-z]{2} \d{1,2}, 2:30 PM$/);
  });

  it('a multi-use pass past its first day says when the last visit ended, or its days', () => {
    const base = { guestType: 'recurring' as const, expectedArrival: at(9, 0, -7) };
    expect(
      visitorStatusDetail(visitor({ ...base, checkedInAt: at(9), checkedOutAt: at(10, 15) }), NOON),
    ).toBe('Last visit ended 10:15 AM');
    expect(visitorStatusDetail(visitor({ ...base, recurrenceRule: 'weekdays' }), NOON)).toBe(
      'Visits weekdays',
    );
    expect(visitorStatusDetail(visitor(base), NOON)).toBe('');
  });

  it('a multi-use pass that was used and left earlier today says so, not its arrival time', () => {
    expect(
      visitorStatusDetail(
        visitor({
          guestType: 'vendor',
          expectedArrival: at(9),
          checkedInAt: at(9, 5),
          checkedOutAt: at(10, 15),
        }),
        NOON,
      ),
    ).toBe('Last visit ended 10:15 AM');
  });

  it('checked in: since when, and the stay', () => {
    expect(
      visitorStatusDetail(visitor({ checkedInAt: at(9, 5), expectedDurationMinutes: 45 }), NOON),
    ).toBe('Since 9:05 AM · 45m stay');
    expect(visitorStatusDetail(visitor({ checkedInAt: at(9, 5) }), NOON)).toBe('Since 9:05 AM');
  });

  it('overstayed: when they came in and when they were due out', () => {
    const detail = visitorStatusDetail(
      visitor({ checkedInAt: ago(3 * HOUR), validUntil: ago(HOUR) }),
    );
    expect(detail).toMatch(/^In .+ · due out .+$/);
  });

  it('checked out: both ends of the visit', () => {
    expect(
      visitorStatusDetail(visitor({ checkedInAt: at(9), checkedOutAt: at(11, 40) }), NOON),
    ).toBe('9:00 AM – 11:40 AM');
  });

  it('expired and revoked: when the pass stopped being good', () => {
    expect(visitorStatusDetail(visitor({ validUntil: ago(HOUR) }))).toMatch(/^Pass ended .+$/);
    expect(visitorStatusDetail(visitor({ revokedAt: ago(HOUR), validUntil: ahead(HOUR) }))).toMatch(
      /^Revoked .+$/,
    );
    expect(
      visitorStatusDetail(visitor({ checkedInAt: ago(2 * HOUR), revokedAt: ago(HOUR) })),
    ).toMatch(/^In .+ · revoked .+$/);
  });
});
