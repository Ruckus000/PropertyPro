/**
 * TCPA consent revocation driven by an inbound STOP.
 *
 * The properties worth pinning:
 *   1. A STOP applies to EVERY community the user belongs to. They texted a
 *      phone number, not an association; honouring it in one and continuing in
 *      another is the violation the keyword exists to prevent.
 *   2. Both the boolean and the timestamp are written. The boolean is what the
 *      send path reads; the timestamp is what proves when consent ended.
 *   3. START does NOT manufacture consent for someone who never gave it.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createUnscopedClientMock, logAuditEventMock } = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  notificationPreferences: {
    userId: 'prefs.user_id',
    communityId: 'prefs.community_id',
  },
  users: { id: 'users.id', phone: 'users.phone' },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

const { restoreSmsConsentByPhone, revokeSmsConsentByPhone } = await import(
  '@/lib/services/sms/sms-consent-service'
);

/**
 * `userRows` answers the phone lookup; `updated` is what the write returns.
 *
 * The lookup chain is AWAITED directly now rather than ending in `.limit(1)` —
 * that limit was the bug. `where()` is therefore thenable. `updateWhereSpy`
 * captures the predicate the write ran with, because "did it target BOTH users"
 * is the property these tests exist to check and a row count alone cannot show
 * it.
 */
function buildDb(opts: { userRows?: unknown[]; updated?: unknown[] }) {
  const updateWhereSpy = vi.fn((_predicate: unknown) => ({
    returning: vi.fn(() => Promise.resolve(opts.updated ?? [])),
  }));
  const setSpy = vi.fn((_values: unknown) => ({ where: updateWhereSpy }));
  return {
    setSpy,
    updateWhereSpy,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(opts.userRows ?? [])),
        })),
      })),
      update: vi.fn(() => ({ set: setSpy })),
    },
  };
}

/** The user ids an `inArray(...)` predicate was built with. */
function idsFromPredicate(pred: unknown): string[] {
  const wrapped = (pred as { __inArray?: [unknown, string[]] }).__inArray;
  return wrapped ? wrapped[1] : [];
}

const NOW = new Date('2026-08-10T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('revokeSmsConsentByPhone', () => {
  it('disables SMS in EVERY community the user belongs to', async () => {
    const { db } = buildDb({
      userRows: [{ id: 'user-1' }],
      updated: [
        { communityId: 1, userId: 'user-1' },
        { communityId: 2, userId: 'user-1' },
        { communityId: 3, userId: 'user-1' },
      ],
    });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await revokeSmsConsentByPhone('+13055550100', NOW);

    expect(result.userIds).toEqual(['user-1']);
    expect(result.rowsUpdated).toBe(3);
    // The WHERE is on userId alone — not scoped to one community, on purpose.
    expect(db.update).toHaveBeenCalledOnce();
  });

  it('writes BOTH the flag and the revocation timestamp', async () => {
    // The boolean is what the send path reads; the timestamp is the evidence.
    // Writing only one leaves either no proof or no effect.
    const { db, setSpy } = buildDb({
      userRows: [{ id: 'user-1' }],
      updated: [{ communityId: 1, userId: 'user-1' }],
    });
    createUnscopedClientMock.mockReturnValue(db);

    await revokeSmsConsentByPhone('+13055550100', NOW);

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ smsEnabled: false, smsConsentRevokedAt: NOW }),
    );
  });

  it('audits once PER COMMUNITY', async () => {
    // The audit log is tenant-scoped, so a board asking "why did this resident
    // stop getting texts" has to find the answer inside their own trail.
    const { db } = buildDb({
      userRows: [{ id: 'user-1' }],
      updated: [{ communityId: 7, userId: 'user-1' }, { communityId: 9, userId: 'user-1' }],
    });
    createUnscopedClientMock.mockReturnValue(db);

    await revokeSmsConsentByPhone('+13055550100', NOW);

    expect(logAuditEventMock).toHaveBeenCalledTimes(2);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 7,
        resourceType: 'sms_consent',
        newValues: expect.objectContaining({ source: 'sms_keyword', smsEnabled: false }),
      }),
    );
  });

  it('returns quietly for a number we do not know', async () => {
    // Twilio retries a non-2xx webhook. Retrying forever over an unknown number
    // is noise — the carrier has stopped delivery either way.
    const { db } = buildDb({ userRows: [] });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await revokeSmsConsentByPhone('+19995550000', NOW);

    expect(result).toEqual({ userIds: [], rowsUpdated: 0 });
    expect(db.update).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('restoreSmsConsentByPhone', () => {
  it('clears the revocation but does NOT enable SMS', async () => {
    // Conservative on purpose: texting START undoes an opt-out, it does not
    // manufacture consent for someone who never opted in. Only the app's own
    // consent flow — which records `smsConsentGivenAt` and the method — turns
    // SMS on.
    const { db, setSpy } = buildDb({
      userRows: [{ id: 'user-1' }],
      updated: [{ communityId: 1, userId: 'user-1' }],
    });
    createUnscopedClientMock.mockReturnValue(db);

    await restoreSmsConsentByPhone('+13055550100', NOW);

    const written = setSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(written['smsConsentRevokedAt']).toBeNull();
    expect(written).not.toHaveProperty('smsEnabled');
  });

  it('returns quietly for an unknown number', async () => {
    const { db } = buildDb({ userRows: [] });
    createUnscopedClientMock.mockReturnValue(db);

    expect(await restoreSmsConsentByPhone('+19995550000', NOW)).toEqual({
      userIds: [],
      rowsUpdated: 0,
    });
  });
});

/**
 * The shared handset.
 *
 * `users.phone` is neither unique nor indexed, and handsets get shared —
 * spouses on one unit, a parent and an adult child. The lookup used to be
 * `.limit(1)` with no ORDER BY, so a STOP revoked whichever row Postgres
 * returned first and the platform kept texting the other person. Damages under
 * the TCPA are per message, so "we silenced one of the two" is the whole
 * violation, not a partial success.
 */
describe('shared handset — one number, several users', () => {
  const SHARED = '+13055550199';

  it('a STOP revokes EVERY user on the number, not an arbitrary one', async () => {
    const { db, updateWhereSpy } = buildDb({
      userRows: [{ id: 'spouse-a' }, { id: 'spouse-b' }],
      updated: [
        { communityId: 1, userId: 'spouse-a' },
        { communityId: 1, userId: 'spouse-b' },
      ],
    });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await revokeSmsConsentByPhone(SHARED, NOW);

    expect(result.userIds).toEqual(['spouse-a', 'spouse-b']);
    // Assert the PREDICATE, not just the returned row count. A write that
    // targeted one user could still report 2 rows if that user belonged to two
    // communities — which is exactly how this bug hid.
    expect(idsFromPredicate(updateWhereSpy.mock.calls[0]![0])).toEqual([
      'spouse-a',
      'spouse-b',
    ]);
  });

  it('audits each user in each of their communities, attributed correctly', async () => {
    // An entry filed against the wrong resident is worse than none: it tells a
    // board that the wrong person opted out.
    const { db } = buildDb({
      userRows: [{ id: 'spouse-a' }, { id: 'spouse-b' }],
      updated: [
        { communityId: 7, userId: 'spouse-a' },
        { communityId: 9, userId: 'spouse-a' },
        { communityId: 7, userId: 'spouse-b' },
      ],
    });
    createUnscopedClientMock.mockReturnValue(db);

    await revokeSmsConsentByPhone(SHARED, NOW);

    expect(logAuditEventMock).toHaveBeenCalledTimes(3);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'spouse-b',
        communityId: 7,
        newValues: expect.objectContaining({ sharedHandsetUserCount: 2 }),
      }),
    );
    // Never attributed to the first id for everyone.
    expect(logAuditEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'spouse-a', communityId: 7, resourceId: 'spouse-b' }),
    );
  });

  it('revokes an UNVERIFIED duplicate alongside the verified owner', async () => {
    // Deliberate over-reach. Filtering to verified users would leave a hole: the
    // unverified sharer verifies later and starts receiving texts on a handset
    // that has already said STOP. Over-revoking is the safe direction.
    const { db, updateWhereSpy } = buildDb({
      userRows: [{ id: 'verified-owner' }, { id: 'unverified-sharer' }],
      updated: [{ communityId: 1, userId: 'verified-owner' }],
    });
    createUnscopedClientMock.mockReturnValue(db);

    await revokeSmsConsentByPhone(SHARED, NOW);

    expect(idsFromPredicate(updateWhereSpy.mock.calls[0]![0])).toContain('unverified-sharer');
  });

  it('a START on a shared number clears both revocations and still enables nobody', async () => {
    // This is the property that makes treating START symmetrically safe. On a
    // shared handset the sender cannot be attributed, so a re-enabling START
    // would let one person undo the other's STOP. It cannot, because START never
    // writes smsEnabled and the send gate requires it to be true.
    const { db, setSpy, updateWhereSpy } = buildDb({
      userRows: [{ id: 'spouse-a' }, { id: 'spouse-b' }],
      updated: [
        { communityId: 1, userId: 'spouse-a' },
        { communityId: 1, userId: 'spouse-b' },
      ],
    });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await restoreSmsConsentByPhone(SHARED, NOW);

    expect(result.userIds).toEqual(['spouse-a', 'spouse-b']);
    expect(idsFromPredicate(updateWhereSpy.mock.calls[0]![0])).toEqual([
      'spouse-a',
      'spouse-b',
    ]);
    const written = setSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(written['smsConsentRevokedAt']).toBeNull();
    expect(written).not.toHaveProperty('smsEnabled');
  });

  it('an unknown number issues no write at all — inArray(col, []) is invalid SQL', async () => {
    // drizzle forbids an empty inArray. The short-circuit is what keeps the
    // zero-match path from becoming a runtime error instead of a quiet no-op.
    const { db } = buildDb({ userRows: [] });
    createUnscopedClientMock.mockReturnValue(db);

    const stop = await revokeSmsConsentByPhone('+19995550000', NOW);
    const start = await restoreSmsConsentByPhone('+19995550000', NOW);

    expect(stop).toEqual({ userIds: [], rowsUpdated: 0 });
    expect(start).toEqual({ userIds: [], rowsUpdated: 0 });
    expect(db.update).not.toHaveBeenCalled();
  });
});
