'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import type { InboxMessage, InboxThread } from '@/lib/server/inbox';

import { MessageBody } from './MessageBody';
import { NotesPanel } from './NotesPanel';
import { ReplyComposer } from './ReplyComposer';
import { StatusControl } from './StatusControl';

interface ThreadViewProps {
  thread: InboxThread;
  /**
   * Messages paired with their server-sanitized HTML.
   *
   * Sanitizing happens on the server and the result is passed in, so no client
   * component ever holds a raw `html_body` — there is nothing here for a future
   * edit to accidentally render.
   */
  messages: Array<{ message: InboxMessage; sanitizedHtml: string }>;
  replyFrom: string;
  replySubject: string;
}

export function ThreadView({ thread, messages, replyFrom, replySubject }: ThreadViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/inbox"
          className="mb-3 inline-flex items-center gap-1 text-sm text-content-secondary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to inbox
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-content">{thread.subject}</h1>
            <p className="mt-1 text-sm text-content-tertiary">
              {thread.participantName ? `${thread.participantName} · ` : ''}
              {thread.participantEmail} · {thread.mailboxLabel}
            </p>
          </div>
          <StatusControl threadId={thread.id} current={thread.status} />
        </div>
      </div>

      <div className="space-y-3">
        {messages.map(({ message, sanitizedHtml }) => (
          <MessageBody key={message.id} message={message} sanitizedHtml={sanitizedHtml} />
        ))}
      </div>

      <ReplyComposer
        threadId={thread.id}
        mailbox={thread.mailbox}
        fromAddress={replyFrom}
        toAddress={thread.participantEmail}
        subject={replySubject}
      />

      <NotesPanel threadId={thread.id} />
    </div>
  );
}
