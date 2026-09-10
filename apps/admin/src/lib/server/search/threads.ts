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
    // `q` arrives already sanitized by `searchAdmin` — see `Searcher.search`'s
    // docblock in `../search.ts`. Do not sanitize again here.
    const { data, error } = await db
      .from('support_inbox_threads')
      .select('id, subject, participant_email, participant_name, mailbox, status, last_message_at')
      .or(`subject.ilike.%${q}%,participant_email.ilike.%${q}%,participant_name.ilike.%${q}%`)
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
