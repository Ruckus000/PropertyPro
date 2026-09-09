/**
 * The admin console's single search surface — the ⌘K command palette's
 * server backend. Each `Searcher` owns one result group; `searchAdmin` fans a
 * query out to all of them concurrently and assembles whichever groups came
 * back with hits.
 *
 * A searcher throwing (a bad filter, a transient DB error) drops only its own
 * group — `Promise.allSettled` means one failing searcher never takes the
 * others down with it.
 *
 * @module lib/server/search
 */
import { NAV_PAGES } from '@/components/shell/nav-config';
import type { SignalIcon } from './signals/types';
import { communitySearcher } from './search/communities';
import { threadSearcher } from './search/threads';
import { userSearcher } from './search/users';

export interface SearchHit {
  id: string;
  label: string;
  meta: string;
  href: string;
  icon: SignalIcon;
}

export interface SearchGroup {
  key: 'pages' | 'clients' | 'threads' | 'tickets' | 'people';
  label: string;
  hits: SearchHit[];
}

export interface Searcher {
  key: SearchGroup['key'];
  label: string;
  search(q: string, limit: number): Promise<SearchHit[]>;
}

const pageSearcher: Searcher = {
  key: 'pages',
  label: 'Pages',
  async search(q, limit) {
    return NAV_PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()))
      .slice(0, limit)
      .map((p) => ({ id: `page-${p.id}`, label: p.label, meta: 'Page', href: p.href, icon: 'activity' as const }));
  },
};

/** Wave 3 (tickets) appends `ticketSearcher` here — one import + one array entry. */
export const SEARCHERS: Searcher[] = [pageSearcher, communitySearcher, threadSearcher, userSearcher];

const PER_GROUP = 5;
export const MAX_QUERY_LENGTH = 80;

export async function searchAdmin(
  raw: string,
  searchers: Searcher[] = SEARCHERS,
): Promise<SearchGroup[]> {
  const q = raw.trim();
  if (q.length < 2) return [];

  const settled = await Promise.allSettled(searchers.map((s) => s.search(q, PER_GROUP)));

  return searchers.flatMap((s, i) => {
    const r = settled[i]!;
    if (r.status === 'rejected' || r.value.length === 0) return [];
    return [{ key: s.key, label: s.label, hits: r.value }];
  });
}
