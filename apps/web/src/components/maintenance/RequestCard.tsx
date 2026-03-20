'use client';

import { useState } from 'react';
import type { MaintenanceRequestItem } from '@/lib/api/maintenance-requests';
import { CommentThread } from './CommentThread';
import { getRequest } from '@/lib/api/maintenance-requests';
import { formatShortDate } from '@/lib/utils/format-date';

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-status-warning-bg text-status-warning',
  acknowledged: 'bg-interactive-subtle text-content-link',
  in_progress: 'bg-status-info-bg text-status-info',
  resolved: 'bg-status-success-bg text-status-success',
  closed: 'bg-surface-muted text-content-secondary',
  open: 'bg-status-warning-bg text-status-warning',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-surface-muted text-content-secondary',
  normal: 'bg-interactive-subtle text-content-link',
  medium: 'bg-interactive-subtle text-content-link',
  high: 'bg-status-warning-bg text-status-warning',
  urgent: 'bg-status-danger-bg text-status-danger',
};

interface RequestCardProps {
  request: MaintenanceRequestItem;
  communityId: number;
}

export function RequestCard({ request, communityId }: RequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(request.comments);

  async function refreshComments() {
    try {
      const res = await getRequest(request.id, communityId);
      setComments(res.data.comments);
    } catch {
      // Silent refresh failure — comments will still show existing
    }
  }

  const statusLabel = request.status === 'open' ? 'submitted' : request.status;
  const priorityLabel = request.priority === 'normal' ? 'medium' : request.priority;

  return (
    <div className="rounded-md border border-edge bg-surface-card shadow-e0">
      <div
        className="flex cursor-pointer items-start justify-between p-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-medium text-content">{request.title}</h3>
          <p className="mt-0.5 text-xs text-content-tertiary">
            {request.category} &middot; {formatShortDate(request.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[statusLabel] ?? 'bg-surface-muted text-content-secondary'}`}
            >
              {statusLabel}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priorityLabel] ?? 'bg-surface-muted text-content-secondary'}`}
            >
              {priorityLabel} priority
            </span>
            {comments.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-secondary">
                {comments.length} comment{comments.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <span className="ml-3 text-content-disabled">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div className="border-t border-edge-subtle px-4 py-3 space-y-3">
          <p className="text-sm text-content-secondary">{request.description}</p>
          {request.resolutionDescription && (
            <div className="rounded-md bg-status-success-bg p-3">
              <p className="text-xs font-medium text-status-success">Resolution</p>
              <p className="mt-0.5 text-sm text-status-success">{request.resolutionDescription}</p>
            </div>
          )}
          {Array.isArray(request.photos) && request.photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {request.photos.map((photo, idx) => (
                <div key={idx} className="h-20 w-20 overflow-hidden rounded-md bg-surface-muted">
                  {photo.thumbnailUrl ? (
                    <img
                      src={photo.thumbnailUrl}
                      alt={`Photo ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-content-disabled">
                      Photo
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <CommentThread
            communityId={communityId}
            requestId={request.id}
            comments={comments}
            onCommentAdded={refreshComments}
          />
        </div>
      )}
    </div>
  );
}
