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
import * as Sentry from '@sentry/nextjs';
import type { SignalIcon } from './signals/types';
import { communitySearcher } from './search/communities';
import { threadSearcher } from './search/threads';
import { ticketSearcher } from './search/tickets';
import { userSearcher } from './search/users';
import { sanitizeSearchTerm, type SanitizedTerm } from './search/sanitize';

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
  /**
   * `q` arrives to every searcher already sanitized by `searchAdmin` (see
   * `sanitizeSearchTerm` in `./search/sanitize.ts`) — implementations build
   * their PostgREST `.or('col.ilike.%<q>%,...')` filter directly from `q` and
   * MUST NOT sanitize it again. Sanitizing once, centrally, in the composer
   * is the fix for a defect that used to live here: the composer sanitized a
   * COPY only to test for emptiness and then discarded it, forwarding the
   * RAW query to every searcher — an implicit convention that happened to be
   * upheld by all three existing searchers re-sanitizing on their own, but
   * that a new searcher (e.g. Wave 3's `ticketSearcher`) could silently
   * violate, reaching a PostgREST `.or()` filter with an unsanitized `,`,
   * `(`, or `)` that restructures the filter instead of matching oddly.
   */
  search(q: SanitizedTerm, limit: number): Promise<SearchHit[]>;
}

export const SEARCHERS: Searcher[] = [
  communitySearcher,
  threadSearcher,
  ticketSearcher,
  userSearcher,
];

const PER_GROUP = 5;
export const MAX_QUERY_LENGTH = 80;

export async function searchAdmin(
  raw: string,
  searchers: Searcher[] = SEARCHERS,
): Promise<SearchGroup[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  // Sanitize ONCE, here, and forward the sanitized term to every searcher
  // (see `Searcher.search`'s docblock — searchers must not re-sanitize). This
  // is also the empty-term gate: a query that is nothing but stripped
  // characters (`"%%"`, `"()"`, `",,"`) would otherwise reach a searcher as
  // an empty term and become the pattern `%%`, matching every row up to the
  // limit.
  const term = sanitizeSearchTerm(q);
  if (term.length === 0) return [];

  const settled = await Promise.allSettled(searchers.map((s) => s.search(term, PER_GROUP)));

  return searchers.flatMap((s, i) => {
    const r = settled[i]!;
    if (r.status === 'rejected') {
      // Mirror shell-signals.ts's identical allSettled composition: a
      // searcher broken by schema drift must not degrade to "No results"
      // silently and forever on the one endpoint that reaches three tables
      // across every tenant.
      Sentry.captureException(r.reason, { tags: { search_searcher: s.key } });
      return [];
    }
    if (r.value.length === 0) return [];
    return [{ key: s.key, label: s.label, hits: r.value }];
  });
}
