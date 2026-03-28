'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useBoardForumThread,
  useCreateForumReply,
  useUpdateForumThread,
} from '@/hooks/use-board';

interface ForumThreadDetailProps {
  communityId: number;
  threadId: number;
  isAdmin: boolean;
  userId: string;
}

export function ForumThreadDetail({
  communityId,
  threadId,
  isAdmin,
  userId: _userId,
}: ForumThreadDetailProps) {
  const { data, isLoading, error } = useBoardForumThread(communityId, threadId);
  const createReply = useCreateForumReply(communityId, threadId);
  const updateThread = useUpdateForumThread(communityId, threadId);
  const [replyBody, setReplyBody] = useState('');

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
      <Link href={`/communities/${communityId}/board/forum`} className="inline-flex text-sm text-interactive hover:underline">
        ← Back to Forum
      </Link>

      <div className="space-y-4 rounded-xl border border-edge bg-surface-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-content">{thread.title}</h1>
            <p className="text-sm text-content-secondary">
              Started by {thread.authorUserId} · {new Date(thread.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {thread.isPinned ? <StatusBadge status="submitted" label="Pinned" /> : null}
            {thread.isLocked ? <StatusBadge status="closed" label="Locked" /> : null}
          </div>
        </div>

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
              <p className="whitespace-pre-wrap text-sm leading-6 text-content">{reply.body}</p>
              <p className="mt-3 text-xs text-content-secondary">
                {reply.authorUserId} · {new Date(reply.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
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
    </div>
  );
}
