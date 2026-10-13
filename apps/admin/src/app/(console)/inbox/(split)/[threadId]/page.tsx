import { notFound } from 'next/navigation';

import { ThreadView } from '@/components/inbox/ThreadView';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getReplyParent, getThreadDetail } from '@/lib/server/inbox';
import { buildReplySubject, replyFromAddress } from '@/lib/server/inbox-threading';
import { sanitizeInboundHtml } from '@/lib/server/sanitize-inbound-html';

export const dynamic = 'force-dynamic';

interface ThreadPageProps {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  await requireAdminPageSession();

  const { threadId: raw } = await params;
  const threadId = Number(raw);
  if (!Number.isInteger(threadId) || threadId <= 0) notFound();

  // Only the thread: the list beside it is `(split)/layout.tsx`'s, which a row
  // click does not re-render. Both reads in one round; neither needs the other.
  const [detail, parent] = await Promise.all([
    getThreadDetail(threadId),
    getReplyParent(threadId),
  ]);
  if (!detail) notFound();

  // Sanitize on the SERVER and hand the result down, so no client component
  // ever holds a raw html_body. Nothing downstream can accidentally render it.
  const messages = detail.messages.map((message) => ({
    message,
    sanitizedHtml: sanitizeInboundHtml(message.htmlBody),
  }));

  // `ThreadView` owns this screen's `<h1>` (the thread subject); the layout's
  // `InboxDashboard` hides the "Inbox" header while a thread is open, so the
  // route still has one `<h1>`. Wave 2 decided: no header here.
  return (
    <ThreadView
      thread={detail.thread}
      messages={messages}
      replyFrom={replyFromAddress(detail.thread.mailbox)}
      replySubject={buildReplySubject(parent?.subject ?? detail.thread.subject)}
    />
  );
}
