/**
 * AnnouncementFeed — Displays announcements in chronological order (pinned first).
 *
 * Renders a list of announcement cards with pin badges and archive indicators.
 * Each card supports pin/unpin and archive actions via the toolbar.
 */
'use client';

import React from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { AnnouncementToolbar } from './announcement-toolbar';

export interface AnnouncementItem {
  id: number;
  title: string;
  body: string;
  audience: string;
  isPinned: boolean;
  archivedAt: string | null;
  publishedBy: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementFeedProps {
  announcements: AnnouncementItem[];
  communityId: number;
  userId: string;
  onPin?: (id: number, isPinned: boolean) => Promise<void>;
  onArchive?: (id: number, archive: boolean) => Promise<void>;
  showArchived?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AnnouncementFeed({
  announcements,
  communityId,
  userId,
  onPin,
  onArchive,
  showArchived = false,
}: AnnouncementFeedProps) {
  const visible = showArchived
    ? announcements
    : announcements.filter((a) => a.archivedAt == null);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-content-tertiary dark:text-content-tertiary">
          No announcements yet.
        </p>
      </div>
    );
  }

  return (
    <div className="pp-announcement-feed flex flex-col gap-4">
      {visible.map((announcement) => (
        <article
          key={announcement.id}
          className={`flex flex-col gap-3 rounded-md border border-edge-subtle bg-surface-card p-5 transition-colors dark:border-gray-700 dark:bg-gray-900 ${
            announcement.archivedAt ? 'opacity-60' : ''
          }`}
          data-testid={`announcement-${announcement.id}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-content dark:text-gray-100">
                  {announcement.title}
                </h3>
                {announcement.isPinned && (
                  <span className="inline-flex items-center rounded-full bg-interactive-subtle px-2 py-0.5 text-xs font-medium text-interactive dark:bg-blue-900/30 dark:text-content-link">
                    Pinned
                  </span>
                )}
                {announcement.archivedAt && (
                  <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-content-secondary dark:bg-gray-800 dark:text-content-disabled">
                    Archived
                  </span>
                )}
                {announcement.audience === 'board_only' ? (
                  <span className="inline-flex items-center rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning dark:bg-amber-900/30 dark:text-amber-400">
                    Board Only
                  </span>
                ) : null}
                {announcement.audience === 'owners_only' ? (
                  <span className="inline-flex items-center rounded-full bg-status-success-bg px-2 py-0.5 text-xs font-medium text-status-success dark:bg-green-900/30 dark:text-green-300">
                    Owners Only
                  </span>
                ) : null}
                {announcement.audience === 'tenants_only' ? (
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    Tenants Only
                  </span>
                ) : null}
              </div>
              <span className="text-xs text-content-tertiary dark:text-content-tertiary">
                {formatDate(announcement.publishedAt)}
              </span>
            </div>

            <AnnouncementToolbar
              announcementId={announcement.id}
              communityId={communityId}
              userId={userId}
              isPinned={announcement.isPinned}
              isArchived={announcement.archivedAt != null}
              onPin={onPin}
              onArchive={onArchive}
            />
          </div>

          <div
            className="prose prose-sm max-w-none text-content-secondary dark:prose-invert dark:text-content-disabled"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(announcement.body) }}
          />
        </article>
      ))}
    </div>
  );
}

export default AnnouncementFeed;
