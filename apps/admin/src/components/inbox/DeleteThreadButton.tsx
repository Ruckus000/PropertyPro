'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface DeleteThreadButtonProps {
  threadId: number;
  participantEmail: string;
}

/**
 * Erase a conversation.
 *
 * Kept visually and physically apart from StatusControl, and available ONLY on
 * the thread you are reading — never as a row action in the list. The status
 * pills are a shelf you can walk back from; this is not, and a mis-click on a
 * list row is both the likeliest and the least informed. `spam` exists so a
 * triage click cannot destroy a statutory records request, and folding delete
 * in beside it would undo exactly that.
 *
 * The dialog says two true things the operator needs before confirming: the
 * internal notes go too (their rows are their own audit trail, so nothing
 * survives them), and our email providers may still hold copies. The second
 * is not decoration — Forward Email receives the inbound mail and Resend keeps
 * outbound bodies in its sent-mail logs, so a database delete is not by itself
 * a complete answer to "delete my data".
 */
export function DeleteThreadButton({
  threadId,
  participantEmail,
}: DeleteThreadButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/inbox/${threadId}`, { method: 'DELETE' });

      /**
       * A 404 means the thread is already gone, which is what was asked for.
       *
       * Treating it as a failure produced a dead end: if the delete succeeded
       * but its audit write threw, the route returns 500 and the operator was
       * told "please try again" about a conversation that no longer exists.
       * Clicking again returned 404 and repeated the same sentence, forever.
       * A second admin deleting the same thread hit it with no audit failure
       * at all.
       */
      if (response.status === 404 || response.ok) {
        router.push('/inbox');
        router.refresh();
        return;
      }

      // Anything else: the delete may or may not have landed, so do NOT advise a
      // retry — logAdminAction throws only AFTER the row is destroyed, and its
      // own message says so before withAdminErrorHandler flattens it to a
      // generic 500. Refreshing is the action that tells the operator the truth.
      setError('Something went wrong. The conversation may already be deleted — refresh the inbox to check.');
      setDeleting(false);
    } catch {
      // Reserved for the network case, where a retry is genuinely the right
      // advice, matching DemoListClient's split.
      setError('Could not reach the server. Please try again.');
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-11 items-center rounded-md border border-edge-strong px-3 text-sm font-medium text-status-danger hover:bg-surface-page md:min-h-9"
      >
        Delete conversation
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-surface-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-content">Delete conversation</h3>
            <p className="mt-2 text-sm text-content-tertiary">
              Delete the conversation with <strong>{participantEmail}</strong> and all its
              messages, including any internal notes? This cannot be undone. Copies may
              remain with our email providers.
            </p>
            {error && <p className="mt-2 text-sm text-status-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="inline-flex min-h-11 items-center rounded-md border border-edge-strong px-4 text-sm font-medium text-content-secondary hover:bg-surface-page md:min-h-9"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex min-h-11 items-center rounded-md bg-status-danger px-4 text-sm font-medium text-content-inverse hover:opacity-90 disabled:opacity-50 md:min-h-9"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
