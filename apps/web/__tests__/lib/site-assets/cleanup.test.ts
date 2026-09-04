import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SITE_ASSET_KINDS } from '@/lib/site-assets/storage-paths';

const { listMock, removeMock, fromMock, createAdminClientMock } = vi.hoisted(() => {
  const listMock = vi.fn();
  const removeMock = vi.fn();
  const fromMock = vi.fn(() => ({ list: listMock, remove: removeMock }));
  return {
    listMock,
    removeMock,
    fromMock,
    createAdminClientMock: vi.fn(() => ({ storage: { from: fromMock } })),
  };
});

vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));

import { purgeCommunitySiteAssets } from '@/lib/site-assets/cleanup';

type ListResult = { data: unknown; error: unknown };

/**
 * Pages queued per storage prefix, e.g. `pages['42/hero']`.
 *
 * These tests used to drive `listMock` with exhaustive `mockResolvedValueOnce`
 * chains, one link per kind. That encoded BOTH the number of kinds and their
 * order into every test: a fourth `list()` call fell off the end of the chain,
 * resolved `undefined`, and the destructure in `cleanup.ts` threw
 * `TypeError: Cannot destructure property 'data' of 'undefined'` — so adding
 * the favicon kind reddened three unrelated tests for a reason that had nothing
 * to do with what they assert. Keying by prefix removes that coupling: a test
 * says what a given kind holds, and every other kind is simply empty.
 */
let pages: Record<string, ListResult[]>;

describe('purgeCommunitySiteAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pages = {};
    removeMock.mockResolvedValue({ error: null });
    listMock.mockImplementation((prefix: string) =>
      Promise.resolve(pages[prefix]?.shift() ?? { data: [], error: null }),
    );
  });

  it('lists + removes objects under each kind prefix', async () => {
    pages['42/logo'] = [{ data: [{ name: 'a.webp' }], error: null }];
    pages['42/hero'] = [
      { data: [{ name: 'b.webp' }, { name: 'b.webp.1600w.webp' }], error: null },
    ];
    // content deliberately left empty

    const result = await purgeCommunitySiteAssets(42);

    expect(result.deletedCount).toBe(3);
    expect(removeMock).toHaveBeenCalledTimes(2); // logo + hero (content was empty)
    expect(removeMock).toHaveBeenCalledWith(['42/logo/a.webp']);
    expect(removeMock).toHaveBeenCalledWith(['42/hero/b.webp', '42/hero/b.webp.1600w.webp']);
  });

  it('returns 0 when community has no assets', async () => {
    const result = await purgeCommunitySiteAssets(42);
    expect(result.deletedCount).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('tolerates a "not found" error from list (acceptable: kind directory does not exist)', async () => {
    pages['42/logo'] = [{ data: null, error: { message: 'The resource was not found' } }];
    pages['42/hero'] = [{ data: [{ name: 'a.webp' }], error: null }];
    const result = await purgeCommunitySiteAssets(42);
    expect(result.deletedCount).toBe(1);
  });

  it('throws on other list errors', async () => {
    pages['42/logo'] = [{ data: null, error: { message: 'storage offline' } }];
    await expect(purgeCommunitySiteAssets(42)).rejects.toThrow(/storage offline/);
  });

  it('throws on remove error', async () => {
    pages['42/logo'] = [{ data: [{ name: 'a.webp' }], error: null }];
    removeMock.mockResolvedValueOnce({ error: { message: 'remove failed' } });
    await expect(purgeCommunitySiteAssets(42)).rejects.toThrow(/remove failed/);
  });

  it('paginates beyond a single 1000-item page per kind', async () => {
    // A full PAGE_SIZE page must trigger a second .list() for the same kind;
    // a short page ends the loop. Tests both halves of the pagination contract.
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ name: `f${i}.webp` }));
    pages['42/logo'] = [
      { data: fullPage, error: null },
      { data: [{ name: 'tail.webp' }], error: null }, // short → break
    ];

    const result = await purgeCommunitySiteAssets(42);

    expect(result.deletedCount).toBe(1001);
    expect(removeMock).toHaveBeenCalledTimes(2); // one remove per non-empty page
    // Count only the LOGO prefix, not every call. Asserting the total would
    // make this test depend on how many kinds exist, so changing the kind list
    // would redden a test about pagination — which is how a failure ends up
    // pointing at the wrong thing.
    const logoCalls = listMock.mock.calls.filter((call) => call[0] === '42/logo');
    expect(logoCalls).toHaveLength(2);
  });

  it('purges the favicon kind, including the .32/.180 variants', async () => {
    // The defect this file now guards: `VALID_KINDS` has always been
    // ['logo','hero','content','favicon'], but the purge loop restated only the
    // first three. Every purged community left its favicon objects behind
    // forever — and the lifecycle cron marks the request 'purged' and never
    // retries, so "behind" meant permanently.
    pages['42/favicon'] = [
      {
        data: [
          { name: 'uuid-logo.png' }, // the raw upload, if finalize's best-effort delete missed it
          { name: 'uuid-logo.png.32.png' },
          { name: 'uuid-logo.png.180.png' },
        ],
        error: null,
      },
    ];

    const result = await purgeCommunitySiteAssets(42);

    expect(result.deletedCount).toBe(3);
    expect(removeMock).toHaveBeenCalledWith([
      '42/favicon/uuid-logo.png',
      '42/favicon/uuid-logo.png.32.png',
      '42/favicon/uuid-logo.png.180.png',
    ]);
  });

  it('walks every kind in SITE_ASSET_KINDS', async () => {
    // The claim that makes the favicon fix durable rather than a one-off: the
    // sweep is DERIVED from the same constant that validates a path, so a kind
    // added later cannot be missed by the purge without also failing to build.
    await purgeCommunitySiteAssets(42);

    const prefixes = listMock.mock.calls.map((call) => call[0] as string);
    expect(new Set(prefixes)).toEqual(
      new Set(SITE_ASSET_KINDS.map((kind) => `42/${kind}`)),
    );
  });
});
