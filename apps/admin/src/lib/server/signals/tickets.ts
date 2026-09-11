/**
 * Open support tickets: the nav badge counts them all, the tray surfaces the
 * high-priority ones.
 *
 * TWO queries, not one filtered in memory. The badge counts every open ticket
 * and the tray wants only `priority = 'high'`, and there is no single read that
 * serves both: a `.limit()`-ed page of open tickets can contain no high-priority
 * row at all while dozens sit below the cut, and the queue's priority column is
 * `text`, so no `.order()` can float them to the top by meaning. (`priority`
 * ascending does put `high` first, but `low` before `medium` gives away that it
 * is alphabetical coincidence, not intent.) `leadsSignals` filters one page in
 * memory because its ICP band is a computed predicate over a column it already
 * orders by; this one cannot borrow that shape.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { SUPPORT_TICKET_CATEGORY_LABELS } from '@propertypro/shared';

import { ticketKey } from '../tickets';
import type { SignalProvider } from './types';

/** How many high-priority tickets the tray shows before it stops being a tray. */
const TRAY_LIMIT = 3;

export const ticketsSignals: SignalProvider = {
  key: 'tickets',
  async load() {
    const db = createAdminTypedClient();

    const [countResult, urgent] = await Promise.all([
      db.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      db
        .from('support_tickets')
        .select('id, title, category, updated_at')
        .eq('status', 'open')
        .eq('priority', 'high')
        .order('updated_at', { ascending: false })
        .limit(TRAY_LIMIT),
    ]);

    if (countResult.error) throw new Error(`tickets signals: ${countResult.error.message}`);
    if (urgent.error) throw new Error(`tickets signals: ${urgent.error.message}`);

    return {
      count: countResult.count ?? 0,
      items: (urgent.data ?? []).map((t) => ({
        id: `ticket-${t.id}`,
        tone: 'danger' as const,
        icon: 'ticket' as const,
        title: `High-priority ticket: ${t.title}`,
        meta: `${ticketKey(t.id)} · ${SUPPORT_TICKET_CATEGORY_LABELS[t.category]}`,
        href: `/tickets/${t.id}`,
        occurredAt: t.updated_at,
      })),
    };
  },
};
