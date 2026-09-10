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

  const detail = await getThreadDetail(threadId);
  if (!detail) notFound();

  const parent = await getReplyParent(threadId);

  // Sanitize on the SERVER and hand the result down, so no client component
  // ever holds a raw html_body. Nothing downstream can accidentally render it.
  const messages = detail.messages.map((message) => ({
    message,
    sanitizedHtml: sanitizeInboundHtml(message.htmlBody),
  }));

  // `ThreadView` owns this screen's own heading and chrome — Wave 2 decides
  // whether it moves onto `AdminPageHeader`.
  return (
    <ThreadView
      thread={detail.thread}
      messages={messages}
      replyFrom={replyFromAddress(detail.thread.mailbox)}
      replySubject={buildReplySubject(parent?.subject ?? detail.thread.subject)}
    />
  );
}
