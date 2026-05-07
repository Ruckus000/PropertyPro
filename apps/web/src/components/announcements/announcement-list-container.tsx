'use client';

/**
 * AnnouncementListContainer — feature-container pattern (B5 pilot).
 *
 * Owns:
 *   - Mutation hooks (`useDeleteAnnouncement`, `useRestoreAnnouncement`).
 *   - "Show deleted" toggle href derivation (depends on isAdmin + URL state).
 *   - Empty-state CTA visibility (depends on canWriteAnnouncements).
 *   - The `canManageItem` per-item authorization decision (admin-or-author).
 *   - Post-mutation router refresh.
 *
 * Hands a pure-prop `<AnnouncementList />` everything it needs to render.
 * The presenter is therefore free of `useDeleteX`/`useRestoreX`, `isAdmin`,
 * and `canWriteAnnouncements` — see `.claude/plans/draft-a-plan-that-reflective-pie.md` §B5.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDeleteAnnouncement, useRestoreAnnouncement } from '@/hooks/use-announcements';
import { AnnouncementList, type AnnouncementListItem } from './announcement-list';

interface AnnouncementListContainerProps {
  items: AnnouncementListItem[];
  communityId: number;
  currentUserId: string;
  isAdmin: boolean;
  canWriteAnnouncements: boolean;
  showDeleted: boolean;
}

export function AnnouncementListContainer({
  items,
  communityId,
  currentUserId,
  isAdmin,
  canWriteAnnouncements,
  showDeleted,
}: AnnouncementListContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deleteMutation = useDeleteAnnouncement(communityId);
  const restoreMutation = useRestoreAnnouncement(communityId);
  const [restoringId, setRestoringId] = useState<number | null>(null);

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

  const canManageItem = useCallback(
    (item: AnnouncementListItem) => isAdmin || item.publishedBy === currentUserId,
    [isAdmin, currentUserId],
  );

  const onDelete = useCallback(
    async (id: number) => {
      await deleteMutation.mutateAsync({ id });
      router.refresh();
    },
    [deleteMutation, router],
  );

  const onRestore = useCallback(
    async (id: number) => {
      setRestoringId(id);
      try {
        await restoreMutation.mutateAsync({ id });
        router.refresh();
      } finally {
        setRestoringId(null);
      }
    },
    [restoreMutation, router],
  );

  const onDialogClose = useCallback(() => {
    deleteMutation.reset();
  }, [deleteMutation]);

  const headerAction = isAdmin ? (
    <Button asChild variant="outline" size="sm">
      <Link href={toggleHref}>{showDeleted ? 'Hide deleted' : 'Show deleted'}</Link>
    </Button>
  ) : undefined;

  const emptyStateAction = canWriteAnnouncements ? (
    <Button asChild>
      <Link href={`/announcements/new?communityId=${communityId}`}>Create announcement</Link>
    </Button>
  ) : undefined;

  const deleteErrorMessage =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;
  const restoreErrorMessage =
    restoreMutation.error instanceof Error ? restoreMutation.error.message : null;

  return (
    <AnnouncementList
      items={items}
      communityId={communityId}
      showDeleted={showDeleted}
      headerAction={headerAction}
      emptyStateAction={emptyStateAction}
      canManageItem={canManageItem}
      onDelete={onDelete}
      onRestore={onRestore}
      isDeleteBusy={deleteMutation.isPending}
      isRestoreBusy={restoreMutation.isPending}
      pendingRestoreId={restoringId}
      deleteError={deleteErrorMessage}
      restoreError={restoreErrorMessage}
      onDialogClose={onDialogClose}
    />
  );
}
