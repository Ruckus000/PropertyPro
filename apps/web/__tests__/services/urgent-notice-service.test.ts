/**
 * Website editor v3, Phase 7 — urgent notice service.
 *
 * The route tests mock this module, so these are the tests that actually
 * exercise the three guards standing between a manager and every visitor to
 * the public site:
 *
 *   1. the site must have been published at least once,
 *   2. the 240-character cap holds regardless of what the caller sent,
 *   3. an expiry in the past is refused rather than written-then-never-shown.
 *
 * Plus the audit trail, which is the only after-the-fact record of what
 * residents were told — there is no draft history for this write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `communitiesTable` lives in the hoisted block too: `vi.mock` factories are
// lifted above every top-level const, so a plain module-scope binding is still
// in its temporal dead zone when the factory runs.
const { createUnscopedClientMock, logAuditEventMock, communitiesTable } = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  communitiesTable: { id: 'communities.id' },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));
vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  logAuditEvent: logAuditEventMock,
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import {
  clearUrgentNotice,
  getUrgentNotice,
  setUrgentNotice,
} from '@/lib/services/urgent-notice-service';

const COMMUNITY_ID = 42;
const ACTOR = 'user-1';
const PUBLISHED = new Date('2026-01-01T00:00:00.000Z');

/** Captures what `.set()` received so assertions can read the written row. */
let updated: Record<string, unknown> | null;

/**
 * Minimal drizzle stand-in. `select().from().where().limit()` resolves to the
 * rows handed in; `update().set().where()` records the patch.
 */
function stubDb(rows: Record<string, unknown>[]) {
  updated = null;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          updated = patch;
        },
      }),
    }),
  };
  createUnscopedClientMock.mockReturnValue(db);
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('setUrgentNotice — the published-site gate', () => {
  it('refuses when the site has never been published', async () => {
    stubDb([{ sitePublishedAt: null, previousText: null, previousExpiresAt: null }]);

    await expect(
      setUrgentNotice({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        text: 'Pool closed',
        expiresAt: null,
      }),
    ).rejects.toThrow(/publish your website/i);

    // Nothing written, nothing logged — a manager must not believe residents
    // were warned when no public page exists to warn them on.
    expect(updated).toBeNull();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('refuses when the community row does not exist', async () => {
    stubDb([]);

    await expect(
      setUrgentNotice({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        text: 'Pool closed',
        expiresAt: null,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('writes once the site has been published', async () => {
    stubDb([{ sitePublishedAt: PUBLISHED, previousText: null, previousExpiresAt: null }]);

    const result = await setUrgentNotice({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      text: 'Pool closed until Monday',
      expiresAt: null,
    });

    expect(result.text).toBe('Pool closed until Monday');
    expect(updated).toMatchObject({
      urgentNoticeText: 'Pool closed until Monday',
      urgentNoticeExpiresAt: null,
      urgentNoticeSetBy: ACTOR,
    });
  });
});

describe('setUrgentNotice — the cap and normalisation', () => {
  beforeEach(() => {
    stubDb([{ sitePublishedAt: PUBLISHED, previousText: null, previousExpiresAt: null }]);
  });

  it('rejects 241 characters even though the route schema let them through', async () => {
    await expect(
      setUrgentNotice({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        text: 'a'.repeat(241),
        expiresAt: null,
      }),
    ).rejects.toThrow(/240 characters/i);
    expect(updated).toBeNull();
  });

  it('accepts exactly 240', async () => {
    await setUrgentNotice({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      text: 'a'.repeat(240),
      expiresAt: null,
    });
    expect(String(updated?.urgentNoticeText)).toHaveLength(240);
  });

  it('rejects whitespace-only text', async () => {
    await expect(
      setUrgentNotice({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        text: '   \n  ',
        expiresAt: null,
      }),
    ).rejects.toThrow(/cannot be empty/i);
  });

  it('stores the NORMALISED text, not the raw input', async () => {
    await setUrgentNotice({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      text: '  Water\nshut off  today  ',
      expiresAt: null,
    });
    expect(updated?.urgentNoticeText).toBe('Water shut off today');
  });

  it('does NOT strip markup — the renderer escapes, this layer must not pretend to', async () => {
    const payload = '<script>alert(1)</script>';
    await setUrgentNotice({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      text: payload,
      expiresAt: null,
    });
    expect(updated?.urgentNoticeText).toBe(payload);
  });
});

describe('setUrgentNotice — expiry', () => {
  beforeEach(() => {
    stubDb([{ sitePublishedAt: PUBLISHED, previousText: null, previousExpiresAt: null }]);
  });

  it('rejects an expiry in the past', async () => {
    await expect(
      setUrgentNotice({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        text: 'Pool closed',
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow(/must be in the future/i);
    expect(updated).toBeNull();
  });

  it('rejects an unparseable expiry', async () => {
    await expect(
      setUrgentNotice({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        text: 'Pool closed',
        expiresAt: new Date('nonsense'),
      }),
    ).rejects.toThrow(/not a valid date/i);
  });

  it('accepts a future expiry', async () => {
    const future = new Date(Date.now() + 60_000);
    await setUrgentNotice({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      text: 'Pool closed',
      expiresAt: future,
    });
    expect(updated?.urgentNoticeExpiresAt).toEqual(future);
  });
});

describe('setUrgentNotice — audit trail', () => {
  it('logs the action with the previous and new values', async () => {
    const previousExpiry = new Date('2026-02-01T00:00:00.000Z');
    stubDb([
      {
        sitePublishedAt: PUBLISHED,
        previousText: 'Old notice',
        previousExpiresAt: previousExpiry,
      },
    ]);

    await setUrgentNotice({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      text: 'New notice',
      expiresAt: null,
    });

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR,
        communityId: COMMUNITY_ID,
        action: 'urgent_notice_set',
        resourceType: 'community',
        resourceId: String(COMMUNITY_ID),
        oldValues: {
          urgentNoticeText: 'Old notice',
          urgentNoticeExpiresAt: previousExpiry.toISOString(),
        },
        newValues: { urgentNoticeText: 'New notice', urgentNoticeExpiresAt: null },
      }),
    );
  });
});

describe('clearUrgentNotice', () => {
  it('nulls every column and logs the removal', async () => {
    stubDb([{ previousText: 'Pool closed', previousExpiresAt: null }]);

    await clearUrgentNotice({ communityId: COMMUNITY_ID, actorUserId: ACTOR });

    expect(updated).toEqual({
      urgentNoticeText: null,
      urgentNoticeExpiresAt: null,
      urgentNoticeSetAt: null,
      urgentNoticeSetBy: null,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'urgent_notice_cleared' }),
    );
  });

  it('is a no-op when nothing is posted — no write, no audit noise', async () => {
    stubDb([{ previousText: null, previousExpiresAt: null }]);

    await clearUrgentNotice({ communityId: COMMUNITY_ID, actorUserId: ACTOR });

    expect(updated).toBeNull();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('getUrgentNotice', () => {
  it('returns null when no notice is stored', async () => {
    stubDb([{ text: null, expiresAt: null, setAt: null }]);
    expect(await getUrgentNotice(COMMUNITY_ID)).toBeNull();
  });

  it('returns an EXPIRED notice — the editor must show what the manager posted', async () => {
    // The public renderer filters on expiry; this read deliberately does not.
    // A notice that is invisible to residents must not also be invisible to
    // the person responsible for it.
    const past = new Date('2020-01-01T00:00:00.000Z');
    stubDb([{ text: 'Pool closed', expiresAt: past, setAt: past }]);

    expect(await getUrgentNotice(COMMUNITY_ID)).toEqual({
      text: 'Pool closed',
      expiresAt: past,
      setAt: past,
    });
  });
});
