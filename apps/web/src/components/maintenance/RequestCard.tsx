'use client';

import { useState } from 'react';
import type { MaintenanceRequestItem } from '@/lib/api/maintenance-requests';
import { CommentThread } from './CommentThread';
import { getRequest } from '@/lib/api/maintenance-requests';

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  acknowledged: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-700',
  open: 'bg-yellow-100 text-yellow-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-blue-100 text-blue-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
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
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div
        className="flex cursor-pointer items-start justify-between p-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-medium text-gray-900">{request.title}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {request.category} &middot; {new Date(request.createdAt).toLocaleDateString()}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[statusLabel] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {statusLabel}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priorityLabel] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {priorityLabel} priority
            </span>
            {comments.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {comments.length} comment{comments.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <span className="ml-3 text-gray-400">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          <p className="text-sm text-gray-700">{request.description}</p>
          {request.resolutionDescription && (
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-xs font-medium text-green-800">Resolution</p>
              <p className="mt-0.5 text-sm text-green-700">{request.resolutionDescription}</p>
            </div>
          )}
          {Array.isArray(request.photos) && request.photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {request.photos.map((photo, idx) => (
                <div key={idx} className="h-20 w-20 overflow-hidden rounded-md bg-gray-100">
                  {photo.thumbnailUrl ? (
                    <img
                      src={photo.thumbnailUrl}
                      alt={`Photo ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">
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
