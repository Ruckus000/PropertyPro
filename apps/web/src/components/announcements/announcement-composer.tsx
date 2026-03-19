/**
 * AnnouncementComposer — Form for creating new announcements.
 *
 * Provides title, body (rich text area), audience selection, and pin toggle.
 * Calls the announcements API on submit.
 */
'use client';

import React, { useState, useCallback, type FormEvent } from 'react';

export type AnnouncementAudience = 'all' | 'owners_only' | 'board_only' | 'tenants_only';

export interface AnnouncementComposerProps {
  communityId: number;
  publishedBy: string;
  onSubmit: (data: {
    title: string;
    body: string;
    audience: AnnouncementAudience;
    isPinned: boolean;
    communityId: number;
    publishedBy: string;
  }) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function AnnouncementComposer({
  communityId,
  publishedBy,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: AnnouncementComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [isPinned, setIsPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!title.trim()) {
        setError('Title is required');
        return;
      }
      if (!body.trim()) {
        setError('Body is required');
        return;
      }

      try {
        await onSubmit({
          title: title.trim(),
          body: body.trim(),
          audience,
          isPinned,
          communityId,
          publishedBy,
        });
        setTitle('');
        setBody('');
        setAudience('all');
        setIsPinned(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create announcement');
      }
    },
    [title, body, audience, isPinned, communityId, publishedBy, onSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="pp-announcement-composer flex flex-col gap-4 rounded-md border border-edge-subtle bg-surface-card p-5 dark:border-gray-700 dark:bg-gray-900"
    >
      <h3 className="text-lg font-semibold text-content dark:text-gray-100">
        New Announcement
      </h3>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-status-danger-bg p-3 text-sm text-status-danger dark:bg-red-900/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-content-secondary dark:text-content-disabled">
          Title
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Announcement title"
          maxLength={500}
          required
          className="rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content placeholder:text-content-disabled focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/25 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-content-secondary dark:text-content-disabled">
          Body
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your announcement..."
          rows={6}
          required
          className="resize-y rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content placeholder:text-content-disabled focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/25 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-content-secondary dark:text-content-disabled">
            Audience
          </span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
            className="rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/25 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="all">All Residents</option>
            <option value="owners_only">Owners Only</option>
            <option value="board_only">Board Members Only</option>
            <option value="tenants_only">Tenants Only</option>
          </select>
        </label>

        <label className="flex items-center gap-2 self-end pb-0.5">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="h-4 w-4 rounded border-edge text-interactive focus:ring-interactive"
          />
          <span className="text-sm text-content-secondary dark:text-content-disabled">
            Pin to top
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-interactive dark:text-content-disabled dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-interactive focus:ring-offset-2 disabled:opacity-50 dark:bg-interactive dark:hover:bg-interactive-subtle0"
        >
          {isSubmitting ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </form>
  );
}

export default AnnouncementComposer;
