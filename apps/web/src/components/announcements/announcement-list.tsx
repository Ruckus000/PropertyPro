'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Announcement } from '@propertypro/db';
import { Loader2, Pin, RotateCcw, Trash2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
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
import { useDeleteAnnouncement, useRestoreAnnouncement } from '@/hooks/use-announcements';

export interface AnnouncementListItem {
  id: number;
  communityId: number;
  title: string;
  body: string;
  audience: string;
  isPinned: boolean;
  publishedAt: string | Date;
  publishedBy: string;
  deletedAt: string | Date | null;
}

interface AnnouncementListProps {
  items: AnnouncementListItem[];
  communityId: number;
  currentUserId: string;
  isAdmin: boolean;
  canWriteAnnouncements?: boolean;
  showDeleted?: boolean;
}

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el.textContent ?? '';
  }
  let result = '';
  let inTag = false;
  let quote: string | null = null;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (inTag) {
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        inTag = false;
      }
    } else if (ch === '<') {
      if (html.substring(i + 1, i + 4) === '!--') {
        const commentEnd = html.indexOf('-->', i + 4);
        if (commentEnd !== -1) {
          i = commentEnd + 2;
          continue;
        }
      }
      inTag = true;
    } else {
      result += ch;
    }
  }
  return result
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function AnnouncementCard({
  item,
  communityId,
  canManage,
  onRequestDelete,
  onRequestRestore,
  isBusy,
}: {
  item: AnnouncementListItem;
  communityId: number;
  canManage: boolean;
  onRequestDelete: (id: number) => void;
  onRequestRestore: (id: number) => void;
  isBusy: boolean;
}) {
  const detailHref = `/announcements/${item.id}?communityId=${communityId}`;
  const editHref = `/announcements/${item.id}/edit?communityId=${communityId}`;
  const isDeleted = item.deletedAt != null;

  return (
    <article
      className={`rounded-md border border-edge bg-surface-card p-5 ${
        isDeleted ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-content">
              <Link href={detailHref} className="hover:text-interactive">
                {item.title}
              </Link>
            </h3>
            {item.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-interactive-subtle px-2 py-0.5 text-xs font-semibold text-interactive">
                <Pin size={12} aria-hidden="true" />
                Pinned
              </span>
            )}
            {isDeleted && <StatusBadge status="closed" label="Deleted" subtle />}
          </div>
          <p className="mt-1 text-xs text-content-tertiary">{formatDate(item.publishedAt)}</p>
        </div>
      </div>
      {item.body && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-content-secondary">
          {stripHtml(item.body)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={detailHref}>View details</Link>
        </Button>
        {canManage && !isDeleted ? (
          <Button asChild size="sm">
            <Link href={editHref}>Edit</Link>
          </Button>
        ) : null}
        {canManage && !isDeleted ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-content-secondary hover:bg-status-danger-bg hover:text-status-danger"
            disabled={isBusy}
            title="Delete announcement"
            onClick={() => onRequestDelete(item.id)}
          >
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
        ) : null}
        {canManage && isDeleted ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => onRequestRestore(item.id)}
          >
            <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
            Restore
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function AnnouncementList({
  items,
  communityId,
  currentUserId,
  isAdmin,
  canWriteAnnouncements = false,
  showDeleted = false,
}: AnnouncementListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const deleteMutation = useDeleteAnnouncement(communityId);
  const restoreMutation = useRestoreAnnouncement(communityId);

  const toggleHref = (() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (showDeleted) {
      params.delete('includeDeleted');
    } else {
      params.set('includeDeleted', 'true');
    }
    if (!params.has('communityId')) {
      params.set('communityId', String(communityId));
    }
    return `/announcements?${params.toString()}`;
  })();

  function canManage(item: AnnouncementListItem): boolean {
    return isAdmin || item.publishedBy === currentUserId;
  }

  const visibleItems = showDeleted ? items : items.filter((item) => item.deletedAt == null);
  const { pinned, unpinned } = visibleItems.reduce<{
    pinned: AnnouncementListItem[];
    unpinned: AnnouncementListItem[];
  }>(
    (acc, item) => {
      (item.isPinned ? acc.pinned : acc.unpinned).push(item);
      return acc;
    },
    { pinned: [], unpinned: [] },
  );

  async function handleConfirmDelete() {
    if (pendingDeleteId === null) return;
    try {
      await deleteMutation.mutateAsync({ id: pendingDeleteId });
      setPendingDeleteId(null);
      router.refresh();
    } catch {
      // error surfaced in dialog body
    }
  }

  async function handleRestore(id: number) {
    try {
      await restoreMutation.mutateAsync({ id });
      router.refresh();
    } catch {
      // surfaced via banner below
    }
  }

  const restoreError =
    restoreMutation.error instanceof Error ? restoreMutation.error.message : null;

  return (
    <div className="space-y-4">
      {isAdmin ? (
        <div className="flex items-center justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href={toggleHref}>
              {showDeleted ? 'Hide deleted' : 'Show deleted'}
            </Link>
          </Button>
        </div>
      ) : null}

      {restoreError ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn't restore this announcement."
          description={restoreError}
        />
      ) : null}

      {visibleItems.length === 0 ? (
        <EmptyState
          icon="bell"
          title={showDeleted ? 'No deleted announcements' : 'No announcements yet'}
          description={
            showDeleted
              ? 'Deleted announcements show up here. Admins can restore them.'
              : canWriteAnnouncements
                ? 'Post your first announcement to keep residents informed.'
                : 'Announcements from your community will appear here.'
          }
          action={
            canWriteAnnouncements && !showDeleted ? (
              <Button asChild>
                <Link href={`/announcements/new?communityId=${communityId}`}>
                  Create announcement
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
                Pinned
              </h2>
              <div className="space-y-3">
                {pinned.map((item) => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    communityId={communityId}
                    canManage={canManage(item)}
                    onRequestDelete={setPendingDeleteId}
                    onRequestRestore={handleRestore}
                    isBusy={
                      (deleteMutation.isPending && pendingDeleteId === item.id) ||
                      (restoreMutation.isPending && restoreMutation.variables?.id === item.id)
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {unpinned.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
                  Recent
                </h2>
              )}
              <div className="space-y-3">
                {unpinned.map((item) => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    communityId={communityId}
                    canManage={canManage(item)}
                    onRequestDelete={setPendingDeleteId}
                    onRequestRestore={handleRestore}
                    isBusy={
                      (deleteMutation.isPending && pendingDeleteId === item.id) ||
                      (restoreMutation.isPending && restoreMutation.variables?.id === item.id)
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setPendingDeleteId(null);
            deleteMutation.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the announcement from residents. Admins can restore it from the Show
              deleted view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && pendingDeleteId !== null ? (
            <AlertBanner
              status="danger"
              variant="subtle"
              title="We couldn't delete this announcement."
              description={
                deleteMutation.error instanceof Error
                  ? deleteMutation.error.message
                  : 'Please try again.'
              }
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-danger text-content-inverse hover:bg-status-danger/90"
              disabled={deleteMutation.isPending || pendingDeleteId === null}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Delete announcement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
