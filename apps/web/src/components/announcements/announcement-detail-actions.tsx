'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
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
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { useDeleteAnnouncement, useRestoreAnnouncement } from '@/hooks/use-announcements';

interface AnnouncementDetailActionsProps {
  communityId: number;
  announcementId: number;
  isDeleted: boolean;
  canEdit: boolean;
}

export function AnnouncementDetailActions({
  communityId,
  announcementId,
  isDeleted,
  canEdit,
}: AnnouncementDetailActionsProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useDeleteAnnouncement(communityId);
  const restoreMutation = useRestoreAnnouncement(communityId);

  async function handleConfirmDelete() {
    try {
      await deleteMutation.mutateAsync({ id: announcementId });
      setConfirmOpen(false);
      router.refresh();
    } catch {
      // error surfaced in dialog body
    }
  }

  async function handleRestore() {
    try {
      await restoreMutation.mutateAsync({ id: announcementId });
      router.refresh();
    } catch {
      // handled via UI state
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit ? (
        <Button asChild size="sm">
          <Link href={`/announcements/${announcementId}/edit?communityId=${communityId}`}>
            Edit
          </Link>
        </Button>
      ) : null}

      {!isDeleted ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-content-secondary hover:bg-status-danger-bg hover:text-status-danger"
          disabled={deleteMutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={restoreMutation.isPending}
          onClick={handleRestore}
        >
          {restoreMutation.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
          )}
          Restore
        </Button>
      )}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setConfirmOpen(false);
            deleteMutation.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the announcement from residents. Admins can restore it from the Show
              deleted view on the announcements list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error ? (
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
              className="bg-status-danger text-content-inverse hover:bg-[var(--red-900)]"
              disabled={deleteMutation.isPending}
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
