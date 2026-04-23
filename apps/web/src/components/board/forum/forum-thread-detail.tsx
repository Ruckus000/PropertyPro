'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useUserNames } from '@/hooks/use-user-names';
import {
  useBoardForumThread,
  useCreateForumReply,
  useDeleteForumReply,
  useUpdateForumThread,
} from '@/hooks/use-board';

interface ForumThreadDetailProps {
  communityId: number;
  threadId: number;
  currentUserId: string;
  isAdmin: boolean;
  canModerateReplies: boolean;
}

export function ForumThreadDetail({
  communityId,
  threadId,
  currentUserId,
  isAdmin,
  canModerateReplies,
}: ForumThreadDetailProps) {
  const { data, isLoading, error } = useBoardForumThread(communityId, threadId);
  const createReply = useCreateForumReply(communityId, threadId);
  const deleteReply = useDeleteForumReply(communityId, threadId);
  const updateThread = useUpdateForumThread(communityId, threadId);
  const userIds = data
    ? Array.from(
        new Set([
          data.thread.authorUserId,
          ...data.replies.map((reply) => reply.authorUserId),
        ]),
      )
    : [];
  const { getName } = useUserNames(communityId, userIds);
  const [replyBody, setReplyBody] = useState('');
  const [replyPendingRemoval, setReplyPendingRemoval] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load this thread."
        description={error instanceof Error ? error.message : 'Please try again.'}
      />
    );
  }

  if (!data) {
    return <EmptyState title="Thread not found" description="This discussion is unavailable." icon="inbox" />;
  }

  const { thread, replies } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={thread.title}
        description={`Started by ${getName(thread.authorUserId)} · ${new Date(thread.createdAt).toLocaleString()}`}
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Board', href: `/communities/${communityId}/board/polls` },
              { label: 'Forum', href: `/communities/${communityId}/board/forum` },
            ]}
            currentLabel={thread.title}
          />
        }
        actions={
          thread.isPinned || thread.isLocked ? (
            <div className="flex flex-wrap gap-2">
              {thread.isPinned ? <StatusBadge status="submitted" label="Pinned" /> : null}
              {thread.isLocked ? <StatusBadge status="closed" label="Locked" /> : null}
            </div>
          ) : undefined
        }
      />

      <div className="space-y-4 rounded-xl border border-edge bg-surface-card p-5">
        <p className="whitespace-pre-wrap text-sm leading-6 text-content">{thread.body}</p>

        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              disabled={updateThread.isPending}
              onClick={() => void updateThread.mutateAsync({ isPinned: !thread.isPinned })}
            >
              {updateThread.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {thread.isPinned ? 'Unpin' : 'Pin'} Thread
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              disabled={updateThread.isPending}
              onClick={() => void updateThread.mutateAsync({ isLocked: !thread.isLocked })}
            >
              {updateThread.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {thread.isLocked ? 'Unlock' : 'Lock'} Thread
            </Button>
          </div>
        ) : null}

        {updateThread.error ? (
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn't update this thread."
            description={updateThread.error instanceof Error ? updateThread.error.message : 'Please try again.'}
          />
        ) : null}
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-content">Replies</h2>
        {replies.length === 0 ? (
          <EmptyState title="No replies yet" description="Be the first to continue this discussion." icon="inbox" size="sm" />
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className="rounded-xl border border-edge bg-surface-card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  {reply.deletedAt ? (
                    <div className="rounded-lg border border-dashed border-edge bg-surface-subtle p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status="closed" label="Reply deleted" subtle />
                      </div>
                      <p className="mt-2 text-sm text-content-secondary">
                        The content has been hidden; conversation order is preserved.
                      </p>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6 text-content">{reply.body}</p>
                  )}
                </div>

                {(canModerateReplies || reply.authorUserId === currentUserId) && !reply.deletedAt ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 shrink-0 px-3 text-content-secondary hover:bg-status-danger-bg hover:text-status-danger md:h-9"
                    disabled={deleteReply.isPending}
                    title="Delete reply"
                    onClick={() => setReplyPendingRemoval(reply.id)}
                  >
                    {deleteReply.isPending && replyPendingRemoval === reply.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Delete reply
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-content-secondary">
                {getName(reply.authorUserId)} · {new Date(reply.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}

        {deleteReply.error && replyPendingRemoval === null ? (
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn't delete this reply."
            description={deleteReply.error instanceof Error ? deleteReply.error.message : 'Please try again.'}
          />
        ) : null}
      </div>

      <Separator />

      <div className="space-y-3 rounded-xl border border-edge bg-surface-card p-4">
        <h2 className="text-base font-semibold text-content">Reply</h2>

        {createReply.error ? (
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn't post this reply."
            description={createReply.error instanceof Error ? createReply.error.message : 'Please try again.'}
          />
        ) : null}

        {thread.isLocked ? (
          <AlertBanner status="warning" variant="subtle" title="This thread is locked" description="Replies are disabled until a moderator unlocks the discussion." />
        ) : null}

        <Textarea
          value={replyBody}
          onChange={(event) => setReplyBody(event.target.value)}
          maxLength={8000}
          className="min-h-32"
          disabled={thread.isLocked || createReply.isPending}
          placeholder="Write your reply"
        />

        <div className="flex justify-end">
          <Button
            type="button"
            className="h-11 md:h-9"
            disabled={thread.isLocked || replyBody.trim().length === 0 || createReply.isPending}
            onClick={() => {
              void createReply.mutateAsync({ body: replyBody.trim() }).then(() => {
                setReplyBody('');
              });
            }}
          >
            {createReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Post Reply
          </Button>
        </div>
      </div>

      <AlertDialog
        open={replyPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open && !deleteReply.isPending) {
            setReplyPendingRemoval(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reply?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the reply for everyone and leaves a placeholder so the conversation still makes sense.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteReply.error && replyPendingRemoval !== null ? (
            <AlertBanner
              status="danger"
              variant="subtle"
              title="We couldn't delete this reply."
              description={deleteReply.error instanceof Error ? deleteReply.error.message : 'Please try again.'}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteReply.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-danger text-content-inverse hover:bg-status-danger/90"
              disabled={deleteReply.isPending || replyPendingRemoval === null}
              onClick={(event) => {
                event.preventDefault();
                if (replyPendingRemoval === null) {
                  return;
                }
                void deleteReply.mutateAsync({ replyId: replyPendingRemoval }).then(() => {
                  setReplyPendingRemoval(null);
                });
              }}
            >
              {deleteReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Delete reply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
