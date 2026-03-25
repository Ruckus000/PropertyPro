import { describe, expect, it } from 'vitest';
import { deriveVisitorStatus } from '../../src/lib/visitors/visitor-logic';

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

  it('returns revoked_on_site when revoked but not checked out', () => {
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
