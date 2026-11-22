'use client';

import { StatusBadge } from '@/components/shared/status-badge';
import type { MaintenanceRequestItem } from '@/lib/api/maintenance-requests';
import { formatShortDate } from '@/lib/utils/format-date';
import { CommentThread } from './CommentThread';

interface RequestCardProps {
  request: MaintenanceRequestItem;
  communityId: number;
  communityTimezone: string;
  /** The signed-in user, so their own comments read "You". */
  viewerUserId?: string;
  /** A manager is told that comments reach the resident. */
  isAdmin?: boolean;
}

/**
 * One maintenance request in full: what was reported, its photos, the
 * resolution once there is one, and the comment thread. The body of the
 * Operations hub's request panel, for residents and managers alike.
 */
export function RequestCard({ request, communityId, communityTimezone, viewerUserId, isAdmin = false }: RequestCardProps) {
  // Legacy names the API may still send for older rows.
  const status = request.status === 'open' ? 'submitted' : request.status;
  const priority = request.priority === 'normal' ? 'medium' : request.priority;
  const comments = request.comments ?? [];
  const photos = Array.isArray(request.photos) ? request.photos : [];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-content">{request.title}</h3>
        <p className="text-sm text-content-tertiary">
          <span className="capitalize">{request.category}</span>
          {request.unitLabel ? ` · ${request.unitLabel}` : null}
          {' · '}
          Submitted {formatShortDate(request.createdAt, communityTimezone)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-content-secondary">
            <span className="capitalize">{priority}</span>&nbsp;priority
          </span>
          {comments.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-secondary">
              {comments.length} comment{comments.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <p className="whitespace-pre-line text-sm text-content-secondary">{request.description}</p>

      {request.resolutionDescription && (
        <div className="rounded-md border border-status-success-border bg-status-success-bg p-3">
          <p className="text-xs font-medium text-status-success">Resolution</p>
          <p className="mt-0.5 text-sm text-content">{request.resolutionDescription}</p>
        </div>
      )}

      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos">
          {photos.map((photo, idx) => {
            // The full-size URL stands in when no thumbnail was made.
            const src = photo.thumbnailUrl ?? photo.url;
            return (
              <li key={photo.storagePath || idx} className="h-20 w-20 overflow-hidden rounded-md bg-surface-muted">
                {src ? (
                  <a href={photo.url ?? src} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned storage URL, not an optimisable asset */}
                    <img src={src} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex h-full items-center justify-center p-1 text-center text-xs text-content-tertiary">
                    Photo unavailable
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CommentThread
        communityId={communityId}
        requestId={request.id}
        comments={comments}
        communityTimezone={communityTimezone}
        viewerUserId={viewerUserId}
        submittedById={request.submittedById}
        isAdmin={isAdmin}
      />
    </div>
  );
}
