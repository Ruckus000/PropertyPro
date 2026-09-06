'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, StickyNote } from 'lucide-react';

interface NotesPanelProps {
  threadId: number;
}

/**
 * Internal notes.
 *
 * A note shares the messages table with real emails so the timeline is one
 * query, and the database's kind-shape CHECK is what makes that safe: a
 * `kind='note'` row cannot carry a sender or a recipient, so it is structurally
 * unaddressable. The warning styling here is the human half of the same point.
 */
export function NotesPanel({ threadId }: NotesPanelProps) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/inbox/${threadId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!response.ok) throw new Error('Request failed');
      setBody('');
      router.refresh();
    } catch {
      setError('We could not save that note. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-status-warning-border bg-status-warning-subtle p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-content">
        <StickyNote className="h-4 w-4" aria-hidden="true" />
        Internal note
      </h2>
      <p className="mb-2 text-xs text-content-tertiary">
        Only visible here. Never sent to the sender.
      </p>

      <label className="sr-only" htmlFor="note-body">
        Internal note
      </label>
      <textarea
        id="note-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        placeholder="Context for later…"
        className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm text-content"
      />

      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || body.trim().length === 0}
        className="mt-2 inline-flex items-center gap-2 rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-hover disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Add note
      </button>
    </section>
  );
}
