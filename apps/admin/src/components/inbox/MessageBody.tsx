'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Paperclip } from 'lucide-react';

import type { InboxMessage } from '@/lib/server/inbox';

import { HtmlMessageFrame } from './HtmlMessageFrame';

interface MessageBodyProps {
  message: InboxMessage;
  /** Server-sanitized HTML for this message, or '' when there is none. */
  sanitizedHtml: string;
}

const MUTED = 'text-content-tertiary';

/**
 * One message in the thread timeline.
 *
 * PLAIN TEXT IS THE DEFAULT. The HTML is attacker-controlled and only rendered
 * when the operator explicitly asks — and then only inside a `sandbox=""`
 * iframe. There is no `dangerouslySetInnerHTML` anywhere under this directory,
 * and there must not be.
 */
export function MessageBody({ message, sanitizedHtml }: MessageBodyProps) {
  const [showHtml, setShowHtml] = useState(false);

  const isNote = message.kind === 'note';
  const isOutbound = message.direction === 'outbound';

  return (
    <article
      className={`rounded-lg border p-4 ${
        isNote
          ? // Visually distinct so an internal note is never mistaken for
            // something the customer received.
            'border-status-warning-border bg-status-warning-subtle'
          : isOutbound
            ? 'border-edge bg-surface-muted'
            : 'border-edge bg-surface-card'
      }`}
    >
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          {isNote ? (
            <span className="font-medium text-status-warning">Internal note</span>
          ) : (
            <>
              <span className="font-medium text-content">
                {message.fromName ?? message.fromEmail ?? 'Unknown sender'}
              </span>
              {message.fromEmail && message.fromName ? (
                <span className={`ml-2 ${MUTED}`}>{message.fromEmail}</span>
              ) : null}
              {isOutbound ? (
                <span className={`ml-2 text-xs ${MUTED}`}>(sent by us)</span>
              ) : null}
            </>
          )}
        </div>
        <time className={`text-xs ${MUTED}`} dateTime={message.occurredAt}>
          {format(new Date(message.occurredAt), 'd MMM yyyy, HH:mm')}
        </time>
      </header>

      {message.unreadable ? (
        <p className="mb-2 flex items-start gap-2 text-sm text-status-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This delivery could not be read. The original payload was kept for
            diagnosis — see <code>raw_payload</code> on this message.
          </span>
        </p>
      ) : null}

      <div className="whitespace-pre-wrap text-sm text-content">
        {message.textBody ?? <span className={MUTED}>(no plain-text body)</span>}
      </div>

      {message.hasAttachments ? (
        <p className={`mt-3 flex items-center gap-2 text-xs ${MUTED}`}>
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          This message had attachments. They are not stored — reply to ask the
          sender to resend, or open the message in Forward Email.
        </p>
      ) : null}

      {sanitizedHtml ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHtml((current) => !current)}
            aria-expanded={showHtml}
            className="text-xs font-medium text-content-link hover:underline"
          >
            {showHtml ? 'Hide original HTML' : 'Show original HTML'}
          </button>
          {showHtml ? (
            <div className="mt-2">
              <p className={`mb-1 text-xs ${MUTED}`}>
                Rendered in an isolated frame with scripts and remote images blocked.
              </p>
              <HtmlMessageFrame sanitizedHtml={sanitizedHtml} />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
