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
 * Pages are NOT one of these searchers. `NAV_PAGES` is a static, in-memory
 * list — `AdminCommandPalette` filters and renders it client-side, instantly,
 * before any fetch resolves (see its own docblock). A server-side page
 * searcher used to exist here too, which meant every query matching a nav
 * label (e.g. "bill" → "Billing") produced TWO "Pages" headings: one from the
 * palette's own client-side render, one from this module's group in the
 * fetched response. Removing it here is the fix — it was never a network
 * concern to begin with.
 *
 * @module lib/server/search
 */
import type { SignalIcon } from './signals/types';
import { communitySearcher } from './search/communities';
import { threadSearcher } from './search/threads';
import { userSearcher } from './search/users';
import { sanitizeSearchTerm } from './search/sanitize';

export interface SearchHit {
  id: string;
  label: string;
  meta: string;
  href: string;
  icon: SignalIcon;
}

export interface SearchGroup {
  key: 'clients' | 'threads' | 'tickets' | 'people';
  label: string;
  hits: SearchHit[];
}

export interface Searcher {
  key: SearchGroup['key'];
  label: string;
  search(q: string, limit: number): Promise<SearchHit[]>;
}

/** Wave 3 (tickets) appends `ticketSearcher` here — one import + one array entry. */
export const SEARCHERS: Searcher[] = [communitySearcher, threadSearcher, userSearcher];

const PER_GROUP = 5;
export const MAX_QUERY_LENGTH = 80;

export async function searchAdmin(
  raw: string,
  searchers: Searcher[] = SEARCHERS,
): Promise<SearchGroup[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  // Every remaining searcher builds a Postgres `ilike` pattern from the same
  // sanitizeSearchTerm() output (see that module's docblock). A query that is
  // nothing but stripped characters (`"%%"`, `"()"`, `",,"`) would otherwise
  // reach a searcher as an empty term and become the pattern `%%`, matching
  // every row up to the limit. Gating here — once, centrally — means no
  // searcher is ever invoked with such a query, rather than every searcher
  // re-deriving the same check.
  if (sanitizeSearchTerm(q).length === 0) return [];

  const settled = await Promise.allSettled(searchers.map((s) => s.search(q, PER_GROUP)));

  return searchers.flatMap((s, i) => {
    const r = settled[i]!;
    if (r.status === 'rejected' || r.value.length === 0) return [];
    return [{ key: s.key, label: s.label, hits: r.value }];
  });
}
