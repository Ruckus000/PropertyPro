'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAddMaintenanceComment } from '@/hooks/use-operations';
import type { CommentItem } from '@/lib/api/maintenance-requests';
import { formatInCommunityTimezone } from '@/lib/utils/format-date';

interface CommentThreadProps {
  communityId: number;
  requestId: number;
  comments: CommentItem[];
  communityTimezone: string;
  /** The signed-in user, so their own comments read "You". */
  viewerUserId?: string;
  /** The resident who submitted the request, so their comments read "Resident". */
  submittedById?: string;
  onCommentAdded?: () => void;
}

function authorLabel(comment: CommentItem, viewerUserId?: string, submittedById?: string): string {
  if (viewerUserId && comment.userId === viewerUserId) return 'You';
  if (submittedById && comment.userId === submittedById) return 'Resident';
  return 'Management';
}

export function CommentThread({
  communityId,
  requestId,
  comments,
  communityTimezone,
  viewerUserId,
  submittedById,
  onCommentAdded,
}: CommentThreadProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addComment = useAddMaintenanceComment(communityId, requestId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      await addComment.mutateAsync(text.trim());
      setText('');
      onCommentAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't post your comment. Please try again.");
    }
  }

  const fieldId = `comment-${requestId}`;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-content">Comments</h3>
      {comments.length === 0 && (
        <p className="text-sm text-content-tertiary">No comments yet.</p>
      )}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-md border border-edge-subtle bg-surface-page p-3">
            <p className="text-sm text-content">{c.text}</p>
            <p className="mt-1 text-xs text-content-tertiary">
              {authorLabel(c, viewerUserId, submittedById)}
              {' · '}
              {formatInCommunityTimezone(c.createdAt, communityTimezone)}
              {c.isInternal ? ' · Internal, not shown to the resident' : null}
            </p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-2">
        <Label htmlFor={fieldId}>Add a comment</Label>
        <Textarea
          id={fieldId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          rows={3}
          placeholder="Write a comment... (max 5000 characters)"
        />
        {error && (
          <p className="text-sm text-status-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="sm" disabled={addComment.isPending || !text.trim()}>
          {addComment.isPending ? 'Posting...' : 'Post comment'}
        </Button>
      </form>
    </div>
  );
}
