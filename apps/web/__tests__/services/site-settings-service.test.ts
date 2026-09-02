/**
 * Website editor v3, Phase 8 — site settings + footer service.
 *
 * The route tests mock this module, so these are the tests that actually
 * exercise the server-side length caps and the patch-construction rules:
 * absent means unchanged, null means clear, and the statutory line stays off
 * unless someone explicitly turns it on.
 *
 * ## What this file deliberately does NOT assert
 *
 * The jsonb merge's *semantics* — that sibling keys survive, that a malformed
 * non-object `siteSettings` is repaired rather than erroring on `||`, that two
 * concurrent writers do not lose an update. Those are properties of Postgres
 * executing the statement, and a mocked `db.execute` cannot observe any of
 * them; asserting them here would only prove the mock returns what it was told
 * to. They live in
 * `__tests__/integration/site-settings-merge.integration.test.ts`, against a
 * real database. What IS checked here is the patch handed to that statement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createUnscopedClientMock,
  logAuditEventMock,
  communitiesTable,
  getUsageMock,
  getQuotaMock,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  communitiesTable: { id: 'communities.id', branding: 'communities.branding' },
  getUsageMock: vi.fn(),
  getQuotaMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));
// The storage helpers are a boundary with their own suite. Left real, they
// would ALSO run their reads through the stub below and eat entries from the
// before/after queue, which is not what any test here is about.
vi.mock('@/lib/site-assets/quota', () => ({
  getCommunitySiteAssetsUsage: getUsageMock,
  getSiteAssetsQuotaBytes: getQuotaMock,
}));
vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  logAuditEvent: logAuditEventMock,
}));
// `sql` is used as a tagged template and nests inside itself, so the stub
// flattens interpolated values into one inspectable list.
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  sql: (_strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    values: values.flatMap((v) =>
      v !== null && typeof v === 'object' && '__sql' in (v as object)
        ? (v as { values: unknown[] }).values
        : [v],
    ),
  }),
}));

import {
  clearSiteFavicon,
  getSiteSettings,
  setSiteFavicon,
  updateSiteSettings,
} from '@/lib/services/site-settings-service';
import {
  FOOTER_NOTE_MAX_LENGTH,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
} from '@/lib/site-editor/site-settings';

const COMMUNITY_ID = 42;
const ACTOR = 'user-1';

/** Every JSON patch string handed to an UPDATE, in order, parsed. */
let executedPatches: Record<string, unknown>[];

/**
 * Minimal drizzle stand-in. `select().from().where().limit()` resolves to the
 * rows handed in; `execute()` records the patches its statement carried.
 *
 * `rows` is a queue — each call to `getSiteSettings` shifts one, so a test can
 * describe the before-state and the after-state separately.
 */
function stubDb(rows: Record<string, unknown>[]) {
  executedPatches = [];
  const queue = [...rows];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [queue.length > 1 ? queue.shift() : queue[0]],
        }),
      }),
    }),
    execute: async (stmt: { values: unknown[] }) => {
      for (const v of stmt.values) {
        if (typeof v === 'string' && v.startsWith('{')) {
          try {
            executedPatches.push(JSON.parse(v) as Record<string, unknown>);
          } catch {
            /* not a patch payload */
          }
        }
      }
    },
  };
  createUnscopedClientMock.mockReturnValue(db);
  return db;
}

const STORAGE = { assetsBytesUsed: 1024, quotaBytes: 524288000 };

beforeEach(() => {
  vi.clearAllMocks();
  logAuditEventMock.mockResolvedValue(undefined);
  getUsageMock.mockResolvedValue(STORAGE.assetsBytesUsed);
  getQuotaMock.mockResolvedValue(STORAGE.quotaBytes);
});

describe('storage — read-only usage against the plan quota', () => {
  it('getSiteSettings carries usage and quota from the storage helpers', async () => {
    stubDb([{ branding: {} }]);
    const result = await getSiteSettings(COMMUNITY_ID);
    expect(result.storage).toEqual(STORAGE);
    expect(getUsageMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(getQuotaMock).toHaveBeenCalledWith(COMMUNITY_ID);
  });

  it('passes a null quota through — no plan limit is a real state, not 0', async () => {
    stubDb([{ branding: {} }]);
    getQuotaMock.mockResolvedValue(null);
    const result = await getSiteSettings(COMMUNITY_ID);
    expect(result.storage).toEqual({ assetsBytesUsed: 1024, quotaBytes: null });
  });

  // The route returns this straight to the client, which caches it AS the
  // record. Drop it here and the meter blanks after every save — and the
  // route test cannot see that, because it mocks this module.
  it('updateSiteSettings returns the storage numbers too', async () => {
    stubDb([{ branding: {} }]);
    const result = await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      seoTitle: 'Title',
    });
    expect(result.storage).toEqual(STORAGE);
  });

  // The before-snapshot the audit log needs has no use for the plan lookup.
  it('reads the plan once per update, not for the audit snapshot', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({ communityId: COMMUNITY_ID, actorUserId: ACTOR, seoTitle: 'T' });
    expect(getQuotaMock).toHaveBeenCalledTimes(1);
  });

  it('the favicon writers never read the quota — they return no record', async () => {
    const favicon = { icon32Path: '42/favicon/a.png', appleTouch180Path: '42/favicon/b.png' };
    stubDb([{ branding: {} }]);
    await setSiteFavicon({ communityId: COMMUNITY_ID, actorUserId: ACTOR, favicon });
    await clearSiteFavicon({ communityId: COMMUNITY_ID, actorUserId: ACTOR });
    expect(getQuotaMock).not.toHaveBeenCalled();
    expect(getUsageMock).not.toHaveBeenCalled();
  });
});

describe('getSiteSettings', () => {
  it('returns defaults for a community with no branding', async () => {
    stubDb([{ branding: null }]);
    const result = await getSiteSettings(COMMUNITY_ID);
    expect(result.settings.searchIndexing).toBe(true);
    expect(result.settings.seoTitle).toBeNull();
    expect(result.footer.showStatutoryLine).toBe(false);
  });

  it('returns defaults — and does not throw — for malformed branding', async () => {
    stubDb([{ branding: 'not an object' }]);
    await expect(getSiteSettings(COMMUNITY_ID)).resolves.toMatchObject({
      settings: { searchIndexing: true },
      footer: { showStatutoryLine: false },
    });
  });
});

describe('updateSiteSettings — server-side length caps', () => {
  it('rejects a title past the cap, with a field path', async () => {
    stubDb([{ branding: {} }]);
    await expect(
      updateSiteSettings({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        seoTitle: 'a'.repeat(SEO_TITLE_MAX_LENGTH + 1),
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { fields: [{ field: 'seoTitle' }] },
    });
  });

  it('rejects a description past the cap', async () => {
    stubDb([{ branding: {} }]);
    await expect(
      updateSiteSettings({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        seoDescription: 'a'.repeat(SEO_DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a footer note past the cap', async () => {
    stubDb([{ branding: {} }]);
    await expect(
      updateSiteSettings({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        note: 'a'.repeat(FOOTER_NOTE_MAX_LENGTH + 1),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // The cap the client's `maxLength` cannot express. An emoji title that reads
  // as 60 characters is 120 UTF-16 units, and must be accepted.
  it('counts code points, so an emoji title at the cap is accepted', async () => {
    stubDb([{ branding: {} }]);
    await expect(
      updateSiteSettings({
        communityId: COMMUNITY_ID,
        actorUserId: ACTOR,
        seoTitle: '🌀'.repeat(SEO_TITLE_MAX_LENGTH),
      }),
    ).resolves.toBeDefined();
  });

  it('trims before measuring', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      seoTitle: `   ${'a'.repeat(SEO_TITLE_MAX_LENGTH)}   `,
    });
    expect(executedPatches[0]?.seoTitle).toBe('a'.repeat(SEO_TITLE_MAX_LENGTH));
  });
});

describe('updateSiteSettings — patch construction', () => {
  it('omits fields the caller did not mention', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      seoTitle: 'Only this',
    });
    expect(executedPatches).toHaveLength(1);
    expect(Object.keys(executedPatches[0] ?? {})).toEqual(['seoTitle']);
  });

  it('writes null to clear a field, distinct from leaving it alone', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      seoTitle: null,
    });
    expect(executedPatches[0]).toEqual({ seoTitle: null });
  });

  it('treats a whitespace-only value as a clear rather than an error', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      note: '    ',
    });
    expect(executedPatches[0]).toEqual({ note: null });
  });

  it('issues no statement at all for an empty patch', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({ communityId: COMMUNITY_ID, actorUserId: ACTOR });
    expect(executedPatches).toHaveLength(0);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('carries settings and footer patches in ONE statement', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      seoTitle: 'Title',
      note: 'Note',
    });
    // Both payloads bound into a single execute() call — a half-applied save
    // (SEO written, footer not) is unreachable.
    expect(executedPatches).toEqual([{ seoTitle: 'Title' }, { note: 'Note' }]);
  });
});

describe('updateSiteSettings — the statutory line stays opt-in', () => {
  it('is never written unless explicitly set', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      associationName: 'Sunset Condominium Association, Inc.',
    });
    expect(executedPatches[0]).not.toHaveProperty('showStatutoryLine');
  });

  it('reads back as false for a community that never opted in', async () => {
    stubDb([{ branding: { siteFooter: { note: 'hi' } } }]);
    const result = await getSiteSettings(COMMUNITY_ID);
    expect(result.footer.showStatutoryLine).toBe(false);
  });

  it('is written only on an explicit true', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      showStatutoryLine: true,
    });
    expect(executedPatches[0]).toEqual({ showStatutoryLine: true });
  });
});

describe('updateSiteSettings — audit trail', () => {
  it('logs settings and footer separately, with old and new values', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({
      communityId: COMMUNITY_ID,
      actorUserId: ACTOR,
      seoTitle: 'Title',
      showStatutoryLine: true,
    });

    const actions = logAuditEventMock.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(['site_settings_updated', 'site_footer_updated']);

    const first = logAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(first).toMatchObject({
      userId: ACTOR,
      communityId: COMMUNITY_ID,
      resourceType: 'community',
    });
    expect(first).toHaveProperty('oldValues');
    expect(first).toHaveProperty('newValues');
  });

  it('logs only the half that changed', async () => {
    stubDb([{ branding: {} }]);
    await updateSiteSettings({ communityId: COMMUNITY_ID, actorUserId: ACTOR, note: 'Note' });
    const actions = logAuditEventMock.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(['site_footer_updated']);
  });
});

describe('favicon', () => {
  const favicon = { icon32Path: '42/favicon/a.png', appleTouch180Path: '42/favicon/b.png' };
  const previous = { icon32Path: '42/favicon/old-a.png', appleTouch180Path: '42/favicon/old-b.png' };

  it('reports the replaced paths so the caller can delete them', async () => {
    stubDb([{ branding: { siteSettings: { favicon: previous } } }]);
    await expect(setSiteFavicon({ communityId: COMMUNITY_ID, actorUserId: ACTOR, favicon }))
      .resolves.toEqual({ previous });
  });

  it('reports no previous paths on a first upload', async () => {
    stubDb([{ branding: {} }]);
    await expect(setSiteFavicon({ communityId: COMMUNITY_ID, actorUserId: ACTOR, favicon }))
      .resolves.toEqual({ previous: null });
  });

  it('clearing reports the paths to delete', async () => {
    stubDb([{ branding: { siteSettings: { favicon: previous } } }]);
    await expect(clearSiteFavicon({ communityId: COMMUNITY_ID, actorUserId: ACTOR }))
      .resolves.toEqual({ previous });
  });

  // No write, no audit entry, and — critically — no quota decrement for bytes
  // that were never there.
  it('clearing an unset favicon is a no-op', async () => {
    stubDb([{ branding: {} }]);
    await expect(clearSiteFavicon({ communityId: COMMUNITY_ID, actorUserId: ACTOR }))
      .resolves.toEqual({ previous: null });
    expect(executedPatches).toHaveLength(0);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
