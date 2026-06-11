'use client';

import { useState } from 'react';

interface ReassignRootControlProps {
  communityId: number;
}

/**
 * Inline reassign-root control for the rootless / open-disputes admin queues.
 * Posts the new property_manager's user id to the reassign-root admin route.
 */
export function ReassignRootControl({ communityId }: ReassignRootControlProps) {
  const [newUserId, setNewUserId] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit() {
    if (!newUserId.trim()) {
      setStatus('error');
      setMessage('Enter the user id of an existing property manager.');
      return;
    }
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/admin/communities/reassign-root', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, newUserId: newUserId.trim() }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus('error');
        setMessage(json.error?.message ?? 'Reassignment failed.');
        return;
      }
      setStatus('done');
      setMessage('Root reassigned.');
    } catch {
      setStatus('error');
      setMessage('Network error.');
    }
  }

  if (status === 'done') {
    return <span className="text-sm text-green-700">{message}</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newUserId}
          onChange={(e) => setNewUserId(e.target.value)}
          placeholder="property_manager user id"
          className="w-72 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={status === 'saving'}
          className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Reassigning…' : 'Reassign root'}
        </button>
      </div>
      {message && status === 'error' && (
        <span className="text-sm text-red-600">{message}</span>
      )}
    </div>
  );
}
