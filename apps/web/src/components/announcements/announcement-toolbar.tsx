/**
 * AnnouncementToolbar — Pin/unpin and archive/unarchive actions for an announcement.
 */
'use client';

import React, { useState, useCallback } from 'react';

export interface AnnouncementToolbarProps {
  announcementId: number;
  communityId: number;
  userId: string;
  isPinned: boolean;
  isArchived: boolean;
  onPin?: (id: number, isPinned: boolean) => Promise<void>;
  onArchive?: (id: number, archive: boolean) => Promise<void>;
}

export function AnnouncementToolbar({
  announcementId,
  isPinned,
  isArchived,
  onPin,
  onArchive,
}: AnnouncementToolbarProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePin = useCallback(async () => {
    if (!onPin || isLoading) return;
    setIsLoading(true);
    try {
      await onPin(announcementId, !isPinned);
    } finally {
      setIsLoading(false);
    }
  }, [announcementId, isPinned, onPin, isLoading]);

  const handleArchive = useCallback(async () => {
    if (!onArchive || isLoading) return;
    setIsLoading(true);
    try {
      await onArchive(announcementId, !isArchived);
    } finally {
      setIsLoading(false);
    }
  }, [announcementId, isArchived, onArchive, isLoading]);

  return (
    <div className="pp-announcement-toolbar flex shrink-0 items-center gap-1">
      {onPin && (
        <button
          type="button"
          onClick={handlePin}
          disabled={isLoading}
          aria-label={isPinned ? 'Unpin announcement' : 'Pin announcement'}
          title={isPinned ? 'Unpin' : 'Pin to top'}
          className={`rounded-md p-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)] disabled:opacity-50 ${
            isPinned
              ? 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] dark:text-gray-500 dark:hover:bg-gray-800'
          }`}
        >
          {/* Pin icon (SVG) */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M9.828 1.172a1 1 0 0 1 1.414 0l3.586 3.586a1 1 0 0 1 0 1.414l-3.172 3.172a.5.5 0 0 1-.353.146H8.5l-2 2v2.01a.5.5 0 0 1-.854.353l-4.5-4.5A.5.5 0 0 1 1.5 8.5h2.01l2-2V3.697a.5.5 0 0 1 .146-.353L9.828 1.172z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}

      {onArchive && (
        <button
          type="button"
          onClick={handleArchive}
          disabled={isLoading}
          aria-label={isArchived ? 'Unarchive announcement' : 'Archive announcement'}
          title={isArchived ? 'Unarchive' : 'Archive'}
          className={`rounded-md p-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)] disabled:opacity-50 ${
            isArchived
              ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] dark:text-gray-500 dark:hover:bg-gray-800'
          }`}
        >
          {/* Archive icon (SVG) */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 3h10v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6zm3 2a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H6z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export default AnnouncementToolbar;
