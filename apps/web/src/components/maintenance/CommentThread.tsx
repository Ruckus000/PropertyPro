'use client';

import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  /**
   * A manager is told the resident reads what they post here, and can instead
   * post an internal note that only staff see.
   */
  isAdmin?: boolean;
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
  isAdmin = false,
  onCommentAdded,
}: CommentThreadProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Managers only. Stays set between posts: switching back to a resident-visible
  // comment is a deliberate click, never something that happens on its own.
  const [internal, setInternal] = useState(false);
  const postInternal = isAdmin && internal;
  const addComment = useAddMaintenanceComment(communityId, requestId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      await addComment.mutateAsync({ text: text.trim(), isInternal: postInternal });
      setText('');
      onCommentAdded?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `We couldn't post your ${postInternal ? 'note' : 'comment'}. Please try again.`,
      );
    }
  }

  const fieldId = `comment-${requestId}`;
  const hintId = `comment-hint-${requestId}`;
  const internalId = `comment-internal-${requestId}`;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-content">Comments</h3>
      {comments.length === 0 && (
        <p className="text-sm text-content-tertiary">No comments yet.</p>
      )}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li
            key={c.id}
            className={
              c.isInternal
                ? 'rounded-md border border-dashed border-edge-strong bg-surface-muted p-3'
                : 'rounded-md border border-edge-subtle bg-surface-page p-3'
            }
          >
            {/* Icon plus a leading word, so a scan of the thread can tell a
                staff-only note from a reply the resident reads. */}
            {c.isInternal ? (
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-content-secondary">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Internal note
              </p>
            ) : null}
            <p className="text-sm text-content">{c.text}</p>
            <p className="mt-1 text-xs text-content-tertiary">
              {authorLabel(c, viewerUserId, submittedById)}
              {' · '}
              {formatInCommunityTimezone(c.createdAt, communityTimezone)}
              {c.isInternal ? ' · Not shown to the resident' : null}
            </p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-2">
        <Label htmlFor={fieldId}>{postInternal ? 'Add an internal note' : 'Add a comment'}</Label>
        {isAdmin ? (
          <p id={hintId} className="text-sm text-content-tertiary">
            {postInternal ? 'Only managers see internal notes. The resident does not.' : 'The resident sees comments.'}
          </p>
        ) : null}
        <Textarea
          id={fieldId}
          aria-describedby={isAdmin ? hintId : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          rows={3}
          placeholder={`Write ${postInternal ? 'an internal note' : 'a comment'}... (max 5000 characters)`}
        />
        {isAdmin ? (
          // w-fit: only the box and its words toggle it. A full-width row let a
          // click in empty space beside it untick a note into a public reply.
          // Still a block-level flex, so the Post button keeps its own line.
          <label
            htmlFor={internalId}
            className="flex w-fit min-h-11 cursor-pointer items-center gap-2 text-sm text-content md:min-h-0"
          >
            <Checkbox
              id={internalId}
              checked={internal}
              disabled={addComment.isPending}
              onCheckedChange={(checked) => setInternal(checked === true)}
            />
            Internal note (managers only)
          </label>
        ) : null}
        {error && (
          <p className="text-sm text-status-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="sm" disabled={addComment.isPending || !text.trim()}>
          {addComment.isPending ? 'Posting...' : postInternal ? 'Post internal note' : 'Post comment'}
        </Button>
      </form>
    </div>
  );
}
