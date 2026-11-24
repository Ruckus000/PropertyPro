'use client';

/**
 * Header actions on an announcement's page, for a viewer who can manage it:
 * Edit and Delete on a live post, Restore on a deleted one. Delete asks first.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
  /**
   * The viewer will not be able to open the post once it is deleted (only
   * admins can), so a successful delete goes to the list, not a 404.
   */
  leaveAfterDelete: boolean;
}

export function AnnouncementDetailActions({
  communityId,
  announcementId,
  isDeleted,
  leaveAfterDelete,
}: AnnouncementDetailActionsProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useDeleteAnnouncement(communityId);
  const restoreMutation = useRestoreAnnouncement(communityId);

  async function handleConfirmDelete() {
    try {
      await deleteMutation.mutateAsync({ id: announcementId });
      setConfirmOpen(false);
      if (leaveAfterDelete) {
        router.push(`/announcements?communityId=${communityId}`);
      }
      router.refresh();
    } catch {
      // error surfaced in dialog body
    }
  }

  async function handleRestore() {
    try {
      await restoreMutation.mutateAsync({ id: announcementId });
      router.refresh();
    } catch (error) {
      // Restore is offered only here, so a failure must not pass silently.
      toast.error(
        error instanceof Error && error.message
          ? `We couldn't restore this announcement. ${error.message}`
          : "We couldn't restore this announcement. Please try again.",
      );
    }
  }

  return (
    <>
      {!isDeleted ? (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={deleteMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
          <Button asChild>
            <Link href={`/announcements/${announcementId}/edit?communityId=${communityId}`}>
              Edit
            </Link>
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          loading={restoreMutation.isPending}
          onClick={handleRestore}
        >
          {!restoreMutation.isPending && <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />}
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
    </>
  );
}
