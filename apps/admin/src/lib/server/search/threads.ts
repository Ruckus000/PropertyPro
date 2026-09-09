/**
 * Command-palette searcher over `support_inbox_threads` — the "Threads" group.
 *
 * No `deleted_at` column exists on this table (threads are never soft-deleted),
 * so there is no exclusion to apply here.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { SUPPORT_MAILBOX_LABELS } from '@propertypro/shared';
import type { Searcher } from '../search';

export const threadSearcher: Searcher = {
  key: 'threads',
  label: 'Threads',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // PostgREST `or` filter; `%` is the LIKE wildcard, the term is escaped of `,` and `%` below.
    const term = q.replace(/[%,()]/g, ' ').trim();
    const { data, error } = await db
      .from('support_inbox_threads')
      .select('id, subject, participant_email, participant_name, mailbox, status, last_message_at')
      .or(`subject.ilike.%${term}%,participant_email.ilike.%${term}%,participant_name.ilike.%${term}%`)
      .limit(limit);
    if (error) throw new Error(`thread search: ${error.message}`);
    return (data ?? []).map((t) => ({
      id: `thread-${t.id}`,
      label: t.subject,
      meta: `${t.status} · ${SUPPORT_MAILBOX_LABELS[t.mailbox]}`,
      href: `/inbox/${t.id}`,
      icon: 'inbox' as const,
    }));
  },
};
