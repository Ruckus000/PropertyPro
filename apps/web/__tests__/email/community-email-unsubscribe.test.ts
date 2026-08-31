/**
 * Tests for the no-login community-email unsubscribe.
 *
 * The properties that matter are the ones whose failure is silent or costly:
 *
 *   1. An unset secret must NOT throw. These are bulk senders — a missing
 *      environment variable that throws would stop every announcement email for
 *      every association, which is far worse than the login-walled fallback.
 *   2. A forged or tampered token must not unsubscribe anyone.
 *   3. Each topic must switch off the flag the corresponding sender actually
 *      reads, or the reader unsubscribes and keeps getting mail.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createUnscopedClientMock } = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  notificationPreferences: {
    id: 'prefs.id',
    communityId: 'prefs.community_id',
    userId: 'prefs.user_id',
  },
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ __and: c }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

const {
  buildCommunityEmailUnsubscribeUrl,
  signCommunityEmailUnsubscribeToken,
  verifyCommunityEmailUnsubscribeToken,
} = await import('@/lib/services/community-email-unsubscribe-token');
const { applyCommunityEmailUnsubscribe } = await import(
  '@/lib/services/community-email-unsubscribe-service'
);

const SECRET = 'test-unsubscribe-secret';

/** Records the `set()` payload so a test can assert WHICH flags were written. */
function buildDb(existingRows: unknown[]) {
  const setSpy = vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) }));
  const insertValues = vi.fn(() => Promise.resolve([]));
  return {
    setSpy,
    insertValues,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(existingRows)) })),
      })),
      update: vi.fn(() => ({ set: setSpy })),
      insert: vi.fn(() => ({ values: insertValues })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET;
});

describe('community email unsubscribe token', () => {
  it('round-trips a payload', () => {
    const token = signCommunityEmailUnsubscribeToken({
      communityId: 42,
      userId: '11111111-2222-3333-4444-555555555555',
      topic: 'announcements',
    });

    expect(verifyCommunityEmailUnsubscribeToken(token!)).toEqual({
      communityId: 42,
      userId: '11111111-2222-3333-4444-555555555555',
      topic: 'announcements',
    });
  });

  it('rejects a token whose payload was tampered with', () => {
    // The whole point of signing: an attacker must not be able to edit the
    // community id and mass-unsubscribe another association.
    const token = signCommunityEmailUnsubscribeToken({
      communityId: 42,
      userId: 'user-1',
      topic: 'announcements',
    })!;
    const [, sig] = token.split('.');
    const forged = `${Buffer.from('99:announcements:user-1').toString('base64url')}.${sig}`;

    expect(verifyCommunityEmailUnsubscribeToken(forged)).toBeNull();
  });

  it('rejects a token signed with a DIFFERENT secret', () => {
    const token = signCommunityEmailUnsubscribeToken({
      communityId: 42,
      userId: 'user-1',
      topic: 'calendar',
    })!;

    process.env.COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET = 'rotated-secret';
    expect(verifyCommunityEmailUnsubscribeToken(token)).toBeNull();
  });

  it('rejects an unknown topic', () => {
    // A topic outside the fixed set has no flag mapping; accepting it would
    // reach `TOPIC_UPDATES[undefined]` and spread nothing into the write.
    const encoded = Buffer.from('42:everything:user-1').toString('base64url');
    const token = signCommunityEmailUnsubscribeToken({
      communityId: 42,
      userId: 'user-1',
      topic: 'announcements',
    })!;
    const forged = `${encoded}.${token.split('.')[1]}`;

    expect(verifyCommunityEmailUnsubscribeToken(forged)).toBeNull();
  });

  it.each(['', 'no-dot', '.', 'abc.def'])('rejects the malformed token %o', (token) => {
    expect(verifyCommunityEmailUnsubscribeToken(token)).toBeNull();
  });
});

describe('buildCommunityEmailUnsubscribeUrl', () => {
  it('builds a token URL when the secret is configured', () => {
    const url = buildCommunityEmailUnsubscribeUrl({
      baseUrl: 'https://app.example',
      communityId: 42,
      userId: 'user-1',
      topic: 'announcements',
    });

    expect(url).toContain('/api/v1/notifications/unsubscribe?token=');
  });

  it('falls back to the settings URL rather than THROWING when unconfigured', () => {
    // This is the load-bearing case. `sendEmail` throws for a non-transactional
    // send with no unsubscribe URL, so returning null/'' here would take down
    // every announcement batch the moment the env var went missing.
    delete process.env.COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET;

    const url = buildCommunityEmailUnsubscribeUrl({
      baseUrl: 'https://app.example',
      communityId: 42,
      userId: 'user-1',
      topic: 'announcements',
    });

    expect(url).toBe('https://app.example/settings?communityId=42');
    expect(url).not.toBe('');
  });

  it('signs nothing when unconfigured', () => {
    delete process.env.COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET;
    expect(
      signCommunityEmailUnsubscribeToken({ communityId: 1, userId: 'u', topic: 'calendar' }),
    ).toBeNull();
  });
});

describe('applyCommunityEmailUnsubscribe', () => {
  it('turns off email_frequency for the notifications topic', async () => {
    // Both the immediate sender and the digest read `emailFrequency`, so this
    // one column is what actually stops the mail. Writing a per-type flag
    // instead would leave the digest still sending.
    const { db, setSpy } = buildDb([{ id: 7 }]);
    createUnscopedClientMock.mockReturnValue(db);

    await applyCommunityEmailUnsubscribe({
      communityId: 42,
      userId: 'user-1',
      topic: 'notifications',
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ emailFrequency: 'never' }),
    );
  });

  it('turns off email_announcements for the announcements topic', async () => {
    const { db, setSpy } = buildDb([{ id: 7 }]);
    createUnscopedClientMock.mockReturnValue(db);

    await applyCommunityEmailUnsubscribe({
      communityId: 42,
      userId: 'user-1',
      topic: 'announcements',
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ emailAnnouncements: false }),
    );
  });

  it('turns off ALL THREE calendar reminder flags', async () => {
    // Reminders fan out across meetings and two assessment kinds. Clearing one
    // would look like an unsubscribe that did not take.
    const { db, setSpy } = buildDb([{ id: 7 }]);
    createUnscopedClientMock.mockReturnValue(db);

    await applyCommunityEmailUnsubscribe({ communityId: 42, userId: 'user-1', topic: 'calendar' });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarReminderMeetings: false,
        calendarReminderPersonalAssessments: false,
        calendarReminderCommunityAssessments: false,
      }),
    );
  });

  it('creates the preferences row when the user has none', async () => {
    // A recipient who never opened settings has no prefs row. Without the
    // insert, their unsubscribe would silently no-op.
    const { db, insertValues } = buildDb([]);
    createUnscopedClientMock.mockReturnValue(db);

    await applyCommunityEmailUnsubscribe({
      communityId: 42,
      userId: 'user-1',
      topic: 'announcements',
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: 'user-1',
        emailAnnouncements: false,
      }),
    );
  });
});
