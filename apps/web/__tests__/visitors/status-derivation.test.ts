import { describe, expect, it } from 'vitest';
import { deriveVisitorStatus, isAllowedVisitDay } from '../../src/lib/visitors/visitor-logic';

const baseVisitor = {
  id: 1,
  communityId: 1,
  visitorName: 'Visitor',
  purpose: 'Guest',
  hostUnitId: 101,
  hostUserId: null,
  expectedArrival: new Date('2026-03-25T12:00:00Z'),
  checkedInAt: null,
  checkedOutAt: null,
  passCode: 'V-12345678',
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
  createdAt: new Date('2026-03-25T12:00:00Z'),
  updatedAt: new Date('2026-03-25T12:00:00Z'),
};

describe('deriveVisitorStatus', () => {
  it('returns expected for a visitor with no timestamps', () => {
    expect(deriveVisitorStatus(baseVisitor)).toBe('expected');
  });

  it('returns checked_in when checkedInAt is set', () => {
    expect(deriveVisitorStatus({
      ...baseVisitor,
      checkedInAt: new Date(),
    })).toBe('checked_in');
  });

  it('returns checked_out when checkedOutAt is set', () => {
    expect(deriveVisitorStatus({
      ...baseVisitor,
      checkedInAt: new Date(),
      checkedOutAt: new Date(),
    })).toBe('checked_out');
  });

  it('returns expired when validUntil is in the past and not checked in', () => {
    expect(deriveVisitorStatus({
      ...baseVisitor,
      validUntil: new Date('2020-01-01T00:00:00Z'),
    })).toBe('expired');
  });

  it('returns overstayed when checked in but validUntil passed', () => {
    expect(deriveVisitorStatus({
      ...baseVisitor,
      checkedInAt: new Date(),
      validUntil: new Date('2020-01-01T00:00:00Z'),
    })).toBe('overstayed');
  });

  it('returns revoked_on_site when revoked while the visitor is on site', () => {
    expect(deriveVisitorStatus({
      ...baseVisitor,
      checkedInAt: new Date(),
      revokedAt: new Date(),
    })).toBe('revoked_on_site');
  });

  it('returns revoked when revoked and checked out', () => {
    expect(deriveVisitorStatus({
      ...baseVisitor,
      checkedInAt: new Date(),
      checkedOutAt: new Date(),
      revokedAt: new Date(),
    })).toBe('revoked');
  });
});

describe('deriveVisitorStatus — multi-use passes', () => {
  const visited = {
    ...baseVisitor,
    checkedInAt: new Date('2026-06-01T12:00:00Z'),
    checkedOutAt: new Date('2026-06-01T14:00:00Z'),
  };

  it('returns revoked, not revoked_on_site, for a pass nobody has used', () => {
    expect(deriveVisitorStatus({ ...baseVisitor, revokedAt: new Date() })).toBe('revoked');
  });

  it('keeps a checked-out one-time pass checked_out', () => {
    expect(deriveVisitorStatus(visited)).toBe('checked_out');
  });

  it.each(['recurring', 'permanent', 'vendor'])(
    'returns a checked-out %s pass to expected while it is valid',
    (guestType) => {
      expect(deriveVisitorStatus({ ...visited, guestType })).toBe('expected');
      expect(
        deriveVisitorStatus({ ...visited, guestType, validUntil: new Date('2099-01-01T00:00:00Z') }),
      ).toBe('expected');
    },
  );

  it('returns expired for a checked-out recurring pass whose window has ended', () => {
    expect(deriveVisitorStatus({
      ...visited,
      guestType: 'recurring',
      validUntil: new Date('2020-01-01T00:00:00Z'),
    })).toBe('expired');
  });

  it('returns checked_in for a permanent pass on its next visit', () => {
    expect(deriveVisitorStatus({
      ...visited,
      guestType: 'permanent',
      checkedInAt: new Date(),
      checkedOutAt: null,
    })).toBe('checked_in');
  });

  it('treats an unknown guest type as single-use', () => {
    expect(deriveVisitorStatus({ ...visited, guestType: 'guest' })).toBe('checked_out');
  });
});

describe('isAllowedVisitDay', () => {
  const NY = 'America/New_York';
  // Friday 21:00 in New York, already Saturday in UTC.
  const fridayNightNY = new Date('2026-11-21T02:00:00Z');

  it('judges the day in the community timezone, not UTC', () => {
    expect(isAllowedVisitDay('weekdays', fridayNightNY, NY)).toBe(true);
    expect(isAllowedVisitDay('weekends', fridayNightNY, NY)).toBe(false);
    expect(isAllowedVisitDay('weekends', fridayNightNY, 'UTC')).toBe(true);
  });

  it('applies the fixed-day rules', () => {
    const wednesday = new Date('2026-11-18T15:00:00Z');
    expect(isAllowedVisitDay('mon_wed_fri', wednesday, NY)).toBe(true);
    expect(isAllowedVisitDay('tue_thu', wednesday, NY)).toBe(false);
  });

  it('does not restrict custom or missing rules', () => {
    expect(isAllowedVisitDay('custom', fridayNightNY, NY)).toBe(true);
    expect(isAllowedVisitDay(null, fridayNightNY, NY)).toBe(true);
  });
});
