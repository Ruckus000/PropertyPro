/**
 * Command-palette searcher over `support_tickets` — the "Tickets" group.
 *
 * Title only. `description` is free text an operator pastes customer details
 * and stack traces into, so matching it would surface a hit whose visible label
 * has nothing to do with the query — and the palette shows the title, not the
 * matched text. `external_ref` is deliberately unindexed (see the schema
 * docblock) and belongs to a different question than "find me that ticket".
 *
 * Resolved tickets are NOT excluded, unlike the soft-deleted rows the
 * `communities` and `users` searchers drop. Those are excluded because their
 * destination 404s; a resolved ticket's page renders perfectly, and "what did we
 * do about this last time" is one of the main reasons to search for one at all.
 * The status is in the `meta` line so a resolved hit is never mistaken for live
 * work.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { SUPPORT_TICKET_PRIORITY_LABELS, SUPPORT_TICKET_STATUS_LABELS } from '@propertypro/shared';

import { ticketKey } from '../tickets';
import type { Searcher } from '../search';

export const ticketSearcher: Searcher = {
  key: 'tickets',
  label: 'Tickets',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // `q` arrives already sanitized by `searchAdmin` — see `Searcher.search`'s
    // docblock in `../search.ts`. Do not sanitize again here.
    const { data, error } = await db
      .from('support_tickets')
      .select('id, title, priority, status')
      .ilike('title', `%${q}%`)
      .limit(limit);
    if (error) throw new Error(`ticket search: ${error.message}`);
    return (data ?? []).map((t) => ({
      id: `ticket-${t.id}`,
      label: t.title,
      meta: `${ticketKey(t.id)} · ${SUPPORT_TICKET_PRIORITY_LABELS[t.priority]} · ${SUPPORT_TICKET_STATUS_LABELS[t.status]}`,
      href: `/tickets/${t.id}`,
      icon: 'ticket' as const,
    }));
  },
};
