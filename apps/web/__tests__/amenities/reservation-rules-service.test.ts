/**
 * createReservationForCommunity enforces the amenity's booking rules before it
 * writes (lib/amenities/booking-rules.ts). The rules themselves are tested in
 * booking-rules.test.ts; this proves the service consults them, with the
 * community's zone, and never inserts a booking that breaks one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectFromMock, insertMock, logAuditEventMock } = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  insertMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  amenities: { id: 'amenities.id', name: 'amenities.name' },
  amenityReservations: {
    amenityId: 'amenity_reservations.amenity_id',
    status: 'amenity_reservations.status',
  },
  clampPageSize: (n?: number) => n ?? 50,
  complianceAuditLog: {},
  createScopedClient: () => ({ selectFrom: selectFromMock, insert: insertMock }),
  logAuditEvent: logAuditEventMock,
  paginate: vi.fn(),
  vendors: {},
  workOrders: {},
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ and: c }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  eq: (c: unknown, v: unknown) => ({ eq: [c, v] }),
  gt: vi.fn(),
  inArray: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('@propertypro/db/audit-actor', () => ({ stampAuditActorMetadata: (m: unknown) => m }));
vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: vi.fn() }));

import { createReservationForCommunity } from '@/lib/services/work-orders-service';

const HOUR = 3_600_000;
// Two days out at a whole hour, so "the past" and "advance" rules never interfere.
const START = new Date(Math.ceil((Date.now() + 48 * HOUR) / HOUR) * HOUR);

function amenityWithRules(bookingRules: Record<string, unknown>) {
  return [{ id: 7, name: 'Pool', isBookable: true, bookingRules }];
}

describe('createReservationForCommunity — booking rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A refused booking never reads existing reservations, so drop any unconsumed queued value.
    selectFromMock.mockReset();
    insertMock.mockResolvedValue([
      { id: 99, amenityId: 7, startTime: START, endTime: new Date(START.getTime() + HOUR), status: 'confirmed' },
    ]);
  });

  it('refuses a booking longer than the amenity allows, and writes nothing', async () => {
    selectFromMock.mockResolvedValueOnce(amenityWithRules({ maxDurationMinutes: 60 })).mockResolvedValueOnce([]);

    await expect(
      createReservationForCommunity(42, 'user-1', {
        amenityId: 7,
        startTime: START.toISOString(),
        endTime: new Date(START.getTime() + 2 * HOUR).toISOString(),
        timeZone: 'America/New_York',
      }),
    ).rejects.toThrow('Bookings for this amenity can be at most 1 hour.');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses a blackout date on the community's calendar", async () => {
    // Close whatever date START falls on in Honolulu, and book in that zone.
    const closedDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Honolulu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(START);
    selectFromMock.mockResolvedValueOnce(amenityWithRules({ blackoutDates: [closedDate] })).mockResolvedValueOnce([]);

    await expect(
      createReservationForCommunity(42, 'user-1', {
        amenityId: 7,
        startTime: START.toISOString(),
        endTime: new Date(START.getTime() + HOUR).toISOString(),
        timeZone: 'Pacific/Honolulu',
      }),
    ).rejects.toThrow(/This amenity is closed on/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('books when every rule is kept', async () => {
    selectFromMock.mockResolvedValueOnce(amenityWithRules({ maxDurationMinutes: 60 })).mockResolvedValueOnce([]);

    const created = await createReservationForCommunity(42, 'user-1', {
      amenityId: 7,
      startTime: START.toISOString(),
      endTime: new Date(START.getTime() + HOUR).toISOString(),
      timeZone: 'America/New_York',
    });
    expect(created.id).toBe(99);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
