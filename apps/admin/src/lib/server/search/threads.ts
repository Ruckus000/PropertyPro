/**
 * Command-palette searcher over `support_inbox_threads` — the "Threads" group.
 *
 * No `deleted_at` column exists on this table (threads are never soft-deleted),
 * so there is no exclusion to apply here.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { SUPPORT_MAILBOX_LABELS } from '@propertypro/shared';
import type { Searcher } from '../search';
import { sanitizeSearchTerm } from './sanitize';

export const threadSearcher: Searcher = {
  key: 'threads',
  label: 'Threads',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // See sanitizeSearchTerm's docblock: this strips (not escapes) `_`, `%`
    // and PostgREST's `or()` delimiters before they reach the ilike filter.
    const term = sanitizeSearchTerm(q);
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
