/**
 * The staff Today tab. A recurring, vendor or permanent pass's
 * `expectedArrival` is only its first day, so filtering on it alone hid a
 * permanent guest from the gate's default view on every later visit.
 */
import { describe, expect, it } from 'vitest';
import { isOnTodayList } from '../../src/components/visitors/visitor-columns';
import type { VisitorListItem } from '../../src/hooks/use-visitors';

const NY = 'America/New_York';
// Wednesday 2026-11-18, 10:00 in New York.
const NOW = new Date('2026-11-18T15:00:00Z');
const LAST_MONTH = '2026-10-01T13:00:00.000Z';

function visitor(overrides: Partial<VisitorListItem> = {}): VisitorListItem {
  return {
    id: 1,
    communityId: 1,
    visitorName: 'Ana Ruiz',
    purpose: 'Caregiver',
    hostUnitId: 3,
    hostUnitLabel: '3A',
    hostUserId: 'tenant-3',
    expectedArrival: LAST_MONTH,
    checkedInAt: null,
    checkedOutAt: null,
    staffUserId: null,
    notes: null,
    guestType: 'permanent',
    validFrom: LAST_MONTH,
    validUntil: null,
    recurrenceRule: null,
    expectedDurationMinutes: null,
    vehicleMake: null,
    vehicleModel: null,
    vehicleColor: null,
    vehiclePlate: null,
    revokedByUserId: null,
    revokedAt: null,
    createdAt: LAST_MONTH,
    updatedAt: LAST_MONTH,
    ...overrides,
  };
}

const visitedYesterday = {
  checkedInAt: '2026-11-17T15:00:00.000Z',
  checkedOutAt: '2026-11-17T16:00:00.000Z',
};

describe('isOnTodayList', () => {
  it('shows a permanent pass that first arrived last month, after a past visit', () => {
    expect(isOnTodayList(visitor(visitedYesterday), NOW, NY)).toBe(true);
  });

  it('does not show a one-time pass from last month', () => {
    expect(isOnTodayList(visitor({ guestType: 'one_time', ...visitedYesterday }), NOW, NY)).toBe(false);
  });

  it('shows a recurring pass on one of its days only', () => {
    const recurring = visitor({ guestType: 'recurring', validUntil: '2099-01-01T00:00:00.000Z' });
    expect(isOnTodayList({ ...recurring, recurrenceRule: 'mon_wed_fri' }, NOW, NY)).toBe(true);
    expect(isOnTodayList({ ...recurring, recurrenceRule: 'tue_thu' }, NOW, NY)).toBe(false);
  });

  it('shows a multi-use visitor who is on site, whatever the day', () => {
    const onSite = visitor({
      guestType: 'recurring',
      recurrenceRule: 'tue_thu',
      checkedInAt: '2026-11-18T14:00:00.000Z',
    });
    expect(isOnTodayList(onSite, NOW, NY)).toBe(true);
  });

  it('hides a pass that has not started, has ended, or was revoked', () => {
    expect(isOnTodayList(visitor({ validFrom: '2026-11-25T13:00:00.000Z' }), NOW, NY)).toBe(false);
    expect(
      isOnTodayList(visitor({ guestType: 'vendor', validUntil: '2026-11-01T00:00:00.000Z' }), NOW, NY),
    ).toBe(false);
    expect(isOnTodayList(visitor({ revokedAt: '2026-11-10T00:00:00.000Z' }), NOW, NY)).toBe(false);
  });
});
