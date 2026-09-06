/**
 * Platform support inbox data access for the admin console.
 *
 * Threads and messages are platform-level (no `community_id` — whoever writes
 * to support@ is usually not a member of any community) and RLS-locked to
 * service_role by migration 0067, so this reads through the admin typed client
 * like the other platform-scoped admin surfaces.
 *
 * Sanitizing inbound HTML deliberately lives in `sanitize-inbound-html.ts`, not
 * here: it is a different responsibility and the piece most likely to change on
 * its own.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type {
  SupportInboxMessageRow,
  SupportInboxThreadRow,
} from '@propertypro/db/supabase/admin-types';
import {
  SUPPORT_MAILBOX_LABELS,
  SUPPORT_THREAD_STATUS_LABELS,
  type SupportMailbox,
  type SupportThreadStatus,
} from '@propertypro/shared';

import { PLATFORM_LIST_LIMIT, wasTruncated } from '@/lib/api/list-limits';

export { SUPPORT_MAILBOX_LABELS, SUPPORT_THREAD_STATUS_LABELS };

export interface InboxThread {
  id: number;
  mailbox: SupportMailbox;
  mailboxLabel: string;
  subject: string;
  participantEmail: string;
  participantName: string | null;
  status: SupportThreadStatus;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
}

export interface InboxMessage {
  id: number;
  kind: 'email' | 'note';
  direction: 'inbound' | 'outbound' | 'internal';
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  textBody: string | null;
  /** RAW sender HTML. Callers MUST pass it through sanitizeInboundHtml. */
  htmlBody: string | null;
  hasAttachments: boolean;
  deliveredTo: string | null;
  rfcMessageId: string | null;
  references: string[] | null;
  occurredAt: string;
  /** True for a quarantined payload the normalizer could not read. */
  unreadable: boolean;
}

export interface InboxStats {
  open: number;
  pending: number;
  closed: number;
  spam: number;
  total: number;
}

export interface InboxFilters {
  mailbox?: string | null;
  status?: string | null;
}

export interface InboxThreadsResult {
  threads: InboxThread[];
  stats: InboxStats;
  /** True when the cap was hit and some threads are not shown. */
  truncated: boolean;
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function mapThread(row: SupportInboxThreadRow): InboxThread {
  return {
    id: row.id,
    mailbox: row.mailbox,
    mailboxLabel: SUPPORT_MAILBOX_LABELS[row.mailbox] ?? row.mailbox,
    subject: row.subject,
    participantEmail: row.participant_email,
    participantName: row.participant_name,
    status: row.status,
    messageCount: row.message_count,
    firstMessageAt: row.first_message_at,
    lastMessageAt: row.last_message_at,
  };
}

function mapMessage(row: SupportInboxMessageRow): InboxMessage {
  return {
    id: row.id,
    kind: row.kind,
    direction: row.direction,
    fromEmail: row.from_email,
    fromName: row.from_name,
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body,
    hasAttachments: row.has_attachments,
    deliveredTo: row.delivered_to,
    rfcMessageId: row.rfc_message_id,
    references: row.references_ids,
    // `sent_at` is a sender-controlled header and can be absurd; `received_at`
    // is ours. Prefer the trustworthy one for ordering and display.
    occurredAt: row.received_at,
    unreadable: row.normalization_status === 'failed',
  };
}

export async function getInboxThreads(
  filters: InboxFilters = {},
): Promise<InboxThreadsResult> {
  const db = createAdminTypedClient();

  let query = db
    .from('support_inbox_threads')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(PLATFORM_LIST_LIMIT);

  if (filters.mailbox && filters.mailbox !== 'all') {
    query = query.eq('mailbox', filters.mailbox as SupportMailbox);
  }
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status as SupportThreadStatus);
  }

  const { data, error } = await query;
  throwIfError(error, 'Failed to load support inbox');

  const rows = (data ?? []) as SupportInboxThreadRow[];
  const threads = rows.map(mapThread);

  return {
    threads,
    stats: {
      open: threads.filter((t) => t.status === 'open').length,
      pending: threads.filter((t) => t.status === 'pending').length,
      closed: threads.filter((t) => t.status === 'closed').length,
      spam: threads.filter((t) => t.status === 'spam').length,
      total: threads.length,
    },
    truncated: wasTruncated(rows.length, PLATFORM_LIST_LIMIT),
  };
}

export interface ThreadDetail {
  thread: InboxThread;
  messages: InboxMessage[];
}

export async function getThreadDetail(threadId: number): Promise<ThreadDetail | null> {
  const db = createAdminTypedClient();

  const { data: threadRow, error: threadError } = await db
    .from('support_inbox_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  throwIfError(threadError, 'Failed to load support thread');
  if (!threadRow) return null;

  const { data: messageRows, error: messageError } = await db
    .from('support_inbox_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('id', { ascending: true })
    .limit(PLATFORM_LIST_LIMIT);
  throwIfError(messageError, 'Failed to load support thread messages');

  return {
    thread: mapThread(threadRow as SupportInboxThreadRow),
    messages: ((messageRows ?? []) as SupportInboxMessageRow[]).map(mapMessage),
  };
}

/**
 * The most recent INBOUND email in a thread — the message a reply answers.
 *
 * `kind = 'email'` is not decorative: an internal note must never become the
 * parent of an outbound reply, or its text would be quoted back to the
 * customer. The database's kind-shape CHECK already denies a note any address
 * fields, so it could not be *addressed*, but it could still be *quoted*.
 */
export async function getReplyParent(threadId: number): Promise<InboxMessage | null> {
  const db = createAdminTypedClient();

  const { data, error } = await db
    .from('support_inbox_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('kind', 'email')
    .eq('direction', 'inbound')
    .order('id', { ascending: false })
    .limit(1);
  throwIfError(error, 'Failed to load the message being replied to');

  const rows = (data ?? []) as SupportInboxMessageRow[];
  return rows[0] ? mapMessage(rows[0]) : null;
}
