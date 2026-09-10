'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import {
  SUPPORT_MAILBOX_CONTEXT,
  SUPPORT_MAILBOX_CONTEXT_ACTION_READY,
  type SupportMailbox,
} from '@propertypro/shared';

interface ThreadContextStripProps {
  mailbox: SupportMailbox;
  threadId: number;
  participantEmail: string;
}

/**
 * The "what to do next" strip for a thread's mailbox (design spec D14/D15).
 *
 * `support` and `privacy` name real destinations that don't exist yet on this
 * branch — `/tickets/new` ships in Task 22 (Wave 3), and `/deletion-requests`
 * doesn't read `?q=` until Task 18. Offering a control that 404s (support) or
 * silently ignores the filter it promised (privacy) is worse than not
 * offering it yet, so those two render as inert copy until
 * `SUPPORT_MAILBOX_CONTEXT_ACTION_READY` flips — a single source those tasks
 * update, not a condition duplicated here.
 */
export function ThreadContextStrip({ mailbox, threadId, participantEmail }: ThreadContextStripProps) {
  const router = useRouter();
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = SUPPORT_MAILBOX_CONTEXT[mailbox];
  const ready = SUPPORT_MAILBOX_CONTEXT_ACTION_READY[mailbox];

  async function convertToLead() {
    setConverting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'Request failed');
      }
      router.push('/leads');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'We could not convert this thread. Please try again.',
      );
      setConverting(false);
    }
  }

  return (
    <section className="rounded-lg border border-edge bg-surface-muted p-4">
      <p className="text-sm font-semibold text-content">{context.title}</p>
      <p className="mt-1 text-sm text-content-secondary">{context.text}</p>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3">
        {mailbox === 'contact' ? (
          <button
            type="button"
            onClick={() => void convertToLead()}
            disabled={converting}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-60 md:min-h-9"
          >
            {converting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {context.action}
          </button>
        ) : ready ? (
          <Link
            href={
              mailbox === 'support'
                ? `/tickets/new?thread=${threadId}`
                : `/deletion-requests?q=${encodeURIComponent(participantEmail)}`
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-hover md:min-h-9"
          >
            {context.action}
          </Link>
        ) : (
          <p className="text-xs text-content-tertiary">
            {context.action} — not available yet, lands in a later wave.
          </p>
        )}
      </div>
    </section>
  );
}
