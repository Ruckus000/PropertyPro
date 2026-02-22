'use client';

import { useState } from 'react';
import type { CommentItem } from '@/lib/api/maintenance-requests';
import { addComment } from '@/lib/api/maintenance-requests';

interface CommentThreadProps {
  communityId: number;
  requestId: number;
  comments: CommentItem[];
  onCommentAdded?: () => void;
}

export function CommentThread({ communityId, requestId, comments, onCommentAdded }: CommentThreadProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addComment({ communityId, requestId, text: text.trim() });
      setText('');
      onCommentAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 && (
        <p className="text-sm text-gray-500">No comments yet.</p>
      )}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-md bg-gray-50 p-3">
            <p className="text-sm text-gray-800">{c.text}</p>
            <p className="mt-1 text-xs text-gray-400">
              {new Date(c.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor={`comment-${requestId}`} className="block text-sm font-medium text-gray-700">
          Add a comment
        </label>
        <textarea
          id={`comment-${requestId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Write a comment… (max 5000 characters)"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
      </form>
    </div>
  );
}
