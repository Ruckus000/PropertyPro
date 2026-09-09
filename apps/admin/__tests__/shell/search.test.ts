import { describe, expect, it, vi } from 'vitest';
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
import { captureException } from '@sentry/nextjs';
import { searchAdmin, SEARCHERS, type Searcher } from '@/lib/server/search';

const stub = (key: Searcher['key'], hits: string[]): Searcher => ({
  key, label: key,
  search: async (q) => hits.filter((h) => h.toLowerCase().includes(q.toLowerCase())).map((h) => ({ id: h, label: h, meta: '', href: `/${key}/${h}`, icon: 'building' as const })),
});

describe('searchAdmin', () => {
  it('returns nothing below two characters', async () => {
    expect(await searchAdmin('s', [stub('clients', ['Sunset'])])).toEqual([]);
  });
  it('groups hits and omits empty groups', async () => {
    const groups = await searchAdmin('sun', [stub('clients', ['Sunset Condos']), stub('people', ['Nobody'])]);
    expect(groups.map((g) => g.key)).toEqual(['clients']);
    expect(groups[0]!.hits[0]!.href).toBe('/clients/Sunset Condos');
  });
  it('a failing searcher drops its group only, and is reported to Sentry tagged with its key', async () => {
    const boom: Searcher = { key: 'threads', label: 'Threads', search: async () => { throw new Error('x'); } };
    const groups = await searchAdmin('sun', [boom, stub('clients', ['Sunset'])]);
    expect(groups.map((g) => g.key)).toEqual(['clients']);
    // Mirrors shell-signals.ts: a searcher broken by schema drift must not
    // degrade to "No results" silently and forever — see search.ts's docblock
    // on the allSettled branch.
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { search_searcher: 'threads' } });
  });
  it('SEARCHERS covers exactly the three DB-backed groups — no server-side "pages" duplicate', () => {
    // Pages are static and client-only (AdminCommandPalette renders NAV_PAGES
    // directly). A page searcher here would produce a second "Pages" heading
    // alongside the palette's own client-side one for any query matching a
    // nav label — see search.ts's docblock.
    expect(SEARCHERS.map((s) => s.key).sort()).toEqual(['clients', 'people', 'threads']);
  });
  it('a term that sanitizes to nothing (all punctuation) returns no results and never reaches a searcher', async () => {
    let called = false;
    const spy: Searcher = {
      key: 'clients',
      label: 'Clients',
      search: async () => {
        called = true;
        return [];
      },
    };
    // "%%" clears the raw two-character minimum but strips to an empty term
    // — without the guard this would reach a real searcher and build the
    // ilike pattern `%%`, matching every row up to the limit.
    expect(await searchAdmin('%%', [spy])).toEqual([]);
    expect(called).toBe(false);
  });
});
