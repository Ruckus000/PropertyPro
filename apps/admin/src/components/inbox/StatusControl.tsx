'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  SUPPORT_THREAD_STATUSES,
  SUPPORT_THREAD_STATUS_LABELS,
  type SupportThreadStatus,
} from '@propertypro/shared';

interface StatusControlProps {
  threadId: number;
  current: SupportThreadStatus;
}

/**
 * Triage control.
 *
 * `spam` is a shelf, not a delete — the thread leaves the default list but
 * stays readable, because a false positive on a statutory records request is
 * not recoverable from a deleted row.
 */
export function StatusControl({ threadId, current }: StatusControlProps) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: SupportThreadStatus) {
    if (next === status || pending) return;
    const previous = status;
    setStatus(next);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/inbox/${threadId}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error('Request failed');
      router.refresh();
    } catch {
      // Roll the optimistic update back rather than leaving the UI asserting a
      // state the database does not have.
      setStatus(previous);
      setError('We could not update the status. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Thread status">
        {SUPPORT_THREAD_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => void change(value)}
            aria-pressed={status === value}
            disabled={pending}
            className={`rounded-full px-3 py-1 text-sm disabled:opacity-60 ${
              status === value
                ? 'bg-interactive text-content-inverse'
                : 'bg-surface-muted text-content-secondary hover:bg-surface-hover'
            }`}
          >
            {SUPPORT_THREAD_STATUS_LABELS[value]}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
