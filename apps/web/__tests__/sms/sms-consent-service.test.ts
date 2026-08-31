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
}));
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

const { restoreSmsConsentByPhone, revokeSmsConsentByPhone } = await import(
  '@/lib/services/sms/sms-consent-service'
);

/** `userRows` answers the phone lookup; `updated` is what the write returns. */
function buildDb(opts: { userRows?: unknown[]; updated?: unknown[] }) {
  const setSpy = vi.fn(() => ({
    where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve(opts.updated ?? [])) })),
  }));
  return {
    setSpy,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(opts.userRows ?? [])) })),
        })),
      })),
      update: vi.fn(() => ({ set: setSpy })),
    },
  };
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
      updated: [{ communityId: 1 }, { communityId: 2 }, { communityId: 3 }],
    });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await revokeSmsConsentByPhone('+13055550100', NOW);

    expect(result.userId).toBe('user-1');
    expect(result.rowsUpdated).toBe(3);
    // The WHERE is on userId alone — not scoped to one community, on purpose.
    expect(db.update).toHaveBeenCalledOnce();
  });

  it('writes BOTH the flag and the revocation timestamp', async () => {
    // The boolean is what the send path reads; the timestamp is the evidence.
    // Writing only one leaves either no proof or no effect.
    const { db, setSpy } = buildDb({
      userRows: [{ id: 'user-1' }],
      updated: [{ communityId: 1 }],
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
      updated: [{ communityId: 7 }, { communityId: 9 }],
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

    expect(result).toEqual({ userId: null, rowsUpdated: 0 });
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
      updated: [{ communityId: 1 }],
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
      userId: null,
      rowsUpdated: 0,
    });
  });
});
