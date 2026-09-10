import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { SUPPORT_MAILBOX_LABELS } from '@propertypro/shared';
import type { SignalProvider } from './types';

/** Open support threads: count for the nav badge, the 5 newest for the tray. */
export const inboxSignals: SignalProvider = {
  key: 'inbox',
  async load() {
    const db = createAdminTypedClient();
    const { data, count, error } = await db
      .from('support_inbox_threads')
      .select('id, subject, participant_name, participant_email, mailbox, last_message_at', { count: 'exact' })
      .eq('status', 'open')
      .order('last_message_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(`inbox signals: ${error.message}`);
    return {
      count: count ?? 0,
      items: (data ?? []).map((t) => ({
        id: `thread-${t.id}`,
        tone: 'info',
        icon: 'inbox',
        title: `New reply from ${t.participant_name ?? t.participant_email}`,
        meta: `${t.subject} · ${SUPPORT_MAILBOX_LABELS[t.mailbox]}`,
        href: `/inbox/${t.id}`,
        occurredAt: t.last_message_at,
      })),
    };
  },
};
