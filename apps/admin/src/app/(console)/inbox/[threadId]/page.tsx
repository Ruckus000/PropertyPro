import { notFound } from 'next/navigation';

import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import { ThreadView } from '@/components/inbox/ThreadView';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getInboxOverview, getReplyParent, getThreadDetail } from '@/lib/server/inbox';
import { buildReplySubject, replyFromAddress } from '@/lib/server/inbox-threading';
import { sanitizeInboundHtml } from '@/lib/server/sanitize-inbound-html';

export const dynamic = 'force-dynamic';

interface ThreadPageProps {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ mailbox?: string; status?: string }>;
}

export default async function ThreadPage({ params, searchParams }: ThreadPageProps) {
  await requireAdminPageSession();

  const { threadId: raw } = await params;
  const threadId = Number(raw);
  if (!Number.isInteger(threadId) || threadId <= 0) notFound();

  const detail = await getThreadDetail(threadId);
  if (!detail) notFound();

  // The split view needs the same unfiltered load as `/inbox` so the list next
  // to this thread reflects the same mailbox/status filters the operator was
  // browsing under — see `InboxDashboard`'s docblock.
  const [{ mailbox, status }, overview, parent] = await Promise.all([
    searchParams,
    getInboxOverview(),
    getReplyParent(threadId),
  ]);

  // Sanitize on the SERVER and hand the result down, so no client component
  // ever holds a raw html_body. Nothing downstream can accidentally render it.
  const messages = detail.messages.map((message) => ({
    message,
    sanitizedHtml: sanitizeInboundHtml(message.htmlBody),
  }));

  // No `AdminPageHeader` on this route — `ThreadView` owns this screen's own
  // `<h1>` (the thread subject), so wrapping it in the header'd `/inbox` chrome
  // would produce two `<h1>`s. Wave 2 decided: no header here.
  return (
    <InboxDashboard
      overview={overview}
      initialMailbox={mailbox ?? 'all'}
      initialStatus={status ?? 'all'}
      activeThreadId={threadId}
      detail={
        <ThreadView
          thread={detail.thread}
          messages={messages}
          replyFrom={replyFromAddress(detail.thread.mailbox)}
          replySubject={buildReplySubject(parent?.subject ?? detail.thread.subject)}
        />
      }
    />
  );
}
