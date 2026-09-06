'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';

import type { SupportMailbox } from '@propertypro/shared';

interface ReplyComposerProps {
  threadId: number;
  mailbox: SupportMailbox;
  /** Shown in the confirm step so the operator sees the real From. */
  fromAddress: string;
  toAddress: string;
  subject: string;
}

const INPUT = 'rounded-md border border-edge-strong';

/**
 * Two-step composer: write, then confirm.
 *
 * The confirm step is not ceremony. This is the only control in the product
 * that emails an arbitrary external address from a PropertyPro sender, and the
 * three facts that decide whether that is correct — which mailbox it comes
 * from, who it reaches, what subject it carries — are all derived on the
 * server and none of them are visible while typing. Showing them before the
 * send is the only moment the operator can catch a reply going to the wrong
 * thread.
 *
 * There is no Dialog primitive in this repo; the inline panel below follows
 * `components/clients/StartSessionDialog.tsx`.
 */
export function ReplyComposer({
  threadId,
  fromAddress,
  toAddress,
  subject,
}: ReplyComposerProps) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trimmed = body.trim();

  async function send() {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/inbox/${threadId}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Only the body. The recipient is derived on the server from the
        // thread — see the route's docblock.
        body: JSON.stringify({ body: trimmed }),
      });

      if (!response.ok) throw new Error('Request failed');

      const result = (await response.json()) as { delivered: boolean };
      if (!result.delivered) {
        // The send returned a test-mode id, meaning nothing was transmitted.
        // Saying "Sent" here would be a lie the operator acts on.
        setNotice(
          'Saved to the thread, but NOT delivered — email is not configured on this deployment.',
        );
      }

      setBody('');
      setConfirming(false);
      router.refresh();
    } catch {
      setError('We could not send that reply. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-lg border border-edge bg-surface-card p-4">
      <h2 className="mb-2 text-sm font-semibold text-content">Reply</h2>

      <label className="sr-only" htmlFor="reply-body">
        Reply message
      </label>
      <textarea
        id="reply-body"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setConfirming(false);
        }}
        rows={6}
        placeholder="Write your reply…"
        className={`${INPUT} w-full px-3 py-2 text-sm text-content`}
      />

      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="alert" className="mt-2 text-sm text-status-warning">
          {notice}
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-3 rounded-md border border-edge-strong bg-surface-muted p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-tertiary">
            Confirm this reply
          </p>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-content-tertiary">From</dt>
              <dd className="text-content">{fromAddress}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-content-tertiary">To</dt>
              <dd className="text-content">{toAddress}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-content-tertiary">Subject</dt>
              <dd className="text-content">{subject}</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-60"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Confirm and send
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={sending}
              className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={trimmed.length === 0}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Send reply
        </button>
      )}
    </section>
  );
}
