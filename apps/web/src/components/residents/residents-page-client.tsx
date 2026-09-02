'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Upload } from 'lucide-react';
import Link from 'next/link';
import type { CommunityType } from '@propertypro/shared';
import { ResidentList } from '@/components/residents/resident-list';
import { ResidentForm, type ResidentFormSubmitValues } from '@/components/residents/resident-form';
import { EmptyState } from '@/components/shared/empty-state';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { AccessRequestList } from '@/components/access-requests/access-request-list';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useInviteResident,
  useResendInvitation,
  useResidentsList,
} from '@/hooks/use-residents-management';

/* ─────── Types ─────── */

interface ResidentsPageClientProps {
  communityId: number;
  communityType: CommunityType;
}

/* ─────── Component ─────── */

export function ResidentsPageClient({ communityId, communityType }: ResidentsPageClientProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendInvitation, setSendInvitation] = useState(true);
  const [invitationWarning, setInvitationWarning] = useState<string | null>(null);

  const {
    data: residents,
    isLoading,
    isError,
    error,
    refetch,
  } = useResidentsList(communityId);

  const mutation = useInviteResident(communityId, {
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['residents', communityId] });
      if (result.invitationFailed) {
        setInvitationWarning(
          'Resident added, but the invitation email failed to send. You can resend it from the resident list.',
        );
      } else {
        setInvitationWarning(null);
        toast.success('Resident added.');
      }
      setDialogOpen(false);
    },
  });

  const handleFormSubmit = useCallback(
    async (values: ResidentFormSubmitValues) => {
      setInvitationWarning(null);
      await mutation.mutateAsync({ values, sendInvitation });
    },
    [mutation, sendInvitation],
  );

  const resendInviteMutation = useResendInvitation(communityId);

  const handleResendInvite = useCallback(
    async (userId: string) => {
      try {
        await resendInviteMutation.mutateAsync(userId);
        toast.success('Invitation resent.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not resend the invitation.');
      }
    },
    [resendInviteMutation],
  );

  // Filter residents by search query
  const filteredResidents = useMemo(() => {
    if (!residents) return [];
    if (!searchQuery.trim()) return residents;
    const q = searchQuery.toLowerCase();
    return residents.filter(
      (r) =>
        r.fullName?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q),
    );
  }, [residents, searchQuery]);

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-content">Residents</h1>
        <AlertBanner
          status="danger"
          title="We couldn't load residents"
          description={error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.'}
          action={
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  /* ── Empty state ── */
  if (residents && residents.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-content">Residents</h1>
        </div>
        <EmptyState
          preset="no_residents"
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:min-h-[36px]"
              >
                <UserPlus size={16} aria-hidden="true" />
                Add Resident
              </button>
              <Link
                href={`/dashboard/import-residents?communityId=${communityId}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted md:min-h-[36px]"
              >
                <Upload size={16} aria-hidden="true" />
                Import CSV
              </Link>
            </div>
          }
        />
        <AddResidentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          communityType={communityType}
          submitting={mutation.isPending}
          onSubmit={handleFormSubmit}
          error={mutation.error instanceof Error ? mutation.error.message : null}
          sendInvitation={sendInvitation}
          onSendInvitationChange={setSendInvitation}
        />
      </div>
    );
  }

  /* ── Success state ── */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-content">Residents</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/import-residents?communityId=${communityId}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted md:min-h-[36px]"
          >
            <Upload size={16} aria-hidden="true" />
            Import CSV
          </Link>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:min-h-[36px]"
          >
            <UserPlus size={16} aria-hidden="true" />
            Add Resident
          </button>
        </div>
      </div>

      {invitationWarning && (
        <AlertBanner
          status="warning"
          title="Invitation not sent"
          description={invitationWarning}
        />
      )}

      <ResidentList
        residents={filteredResidents}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onResendInvite={handleResendInvite}
      />

      {searchQuery && filteredResidents.length === 0 && (
        <EmptyState preset="no_results" size="sm" />
      )}

      <div className="space-y-3 pt-2">
        <h2 className="text-lg font-semibold text-content">Access Requests</h2>
        <p className="text-sm text-content-secondary">
          Review and approve or deny pending requests to join this community.
        </p>
        <AccessRequestList communityId={communityId} />
      </div>

      <AddResidentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        communityType={communityType}
        submitting={mutation.isPending}
        onSubmit={handleFormSubmit}
        error={mutation.error instanceof Error ? mutation.error.message : null}
        sendInvitation={sendInvitation}
        onSendInvitationChange={setSendInvitation}
      />
    </div>
  );
}

/* ─────── Add Resident Dialog ─────── */

interface AddResidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityType: CommunityType;
  submitting: boolean;
  onSubmit: (values: ResidentFormSubmitValues) => Promise<void>;
  error: string | null;
  sendInvitation: boolean;
  onSendInvitationChange: (value: boolean) => void;
}

function AddResidentDialog({
  open,
  onOpenChange,
  communityType,
  submitting,
  onSubmit,
  error,
  sendInvitation,
  onSendInvitationChange,
}: AddResidentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" resizable>
        <DialogHeader>
          <DialogTitle>Add Resident</DialogTitle>
          <DialogDescription>
            Add a new resident to the community. They will receive portal access.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <AlertBanner
            status="danger"
            title="Failed to add resident"
            description={error}
          />
        )}

        <ResidentForm
          communityType={communityType}
          submitting={submitting}
          onSubmit={onSubmit}
        />

        <label className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            checked={sendInvitation}
            onChange={(e) => onSendInvitationChange(e.target.checked)}
            className="h-4 w-4 rounded border-edge-strong"
          />
          <span className="text-sm text-content-secondary">
            Send invitation email
          </span>
        </label>
      </DialogContent>
    </Dialog>
  );
}
