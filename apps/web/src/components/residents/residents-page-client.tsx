'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { ResidentList } from '@/components/residents/resident-list';
import { ResidentForm, type ResidentFormSubmitValues } from '@/components/residents/resident-form';
import { EmptyState } from '@/components/shared/empty-state';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/* ─────── Types ─────── */

interface ResidentRecord {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string;
  unitId: number | null;
}

interface ResidentsPageClientProps {
  communityId: number;
  communityType: CommunityType;
}

/* ─────── API helpers ─────── */

async function fetchResidents(communityId: number): Promise<ResidentRecord[]> {
  const response = await fetch(`/api/v1/residents?communityId=${communityId}`);
  if (!response.ok) {
    throw new Error('Failed to load residents');
  }
  const json = await response.json() as { data: ResidentRecord[] };
  return json.data;
}

interface CreateResidentResult {
  userId: string;
  isNewUser: boolean;
  invitationFailed: boolean;
}

async function createAndInviteResident(
  communityId: number,
  values: ResidentFormSubmitValues,
  sendInvitation: boolean,
): Promise<CreateResidentResult> {
  const response = await fetch('/api/v1/residents/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      communityId,
      email: values.email,
      fullName: values.fullName,
      phone: values.phone || null,
      role: values.role,
      unitId: values.unitId,
      isUnitOwner: values.isUnitOwner,
      presetKey: values.presetKey,
      sendInvitation,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Failed to add resident');
  }

  const json = await response.json() as { data: CreateResidentResult };
  return json.data;
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
  } = useQuery({
    queryKey: ['residents', communityId],
    queryFn: () => fetchResidents(communityId),
  });

  const mutation = useMutation({
    mutationFn: (values: ResidentFormSubmitValues) =>
      createAndInviteResident(communityId, values, sendInvitation),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['residents', communityId] });
      if (result.invitationFailed) {
        setInvitationWarning(
          'Resident added, but the invitation email failed to send. You can resend it from the resident list.',
        );
      } else {
        setInvitationWarning(null);
      }
      setDialogOpen(false);
    },
  });

  const handleFormSubmit = useCallback(
    async (values: ResidentFormSubmitValues) => {
      setInvitationWarning(null);
      await mutation.mutateAsync(values);
    },
    [mutation],
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
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:min-h-[36px]"
            >
              <UserPlus size={16} aria-hidden="true" />
              Add Resident
            </button>
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
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:min-h-[36px]"
        >
          <UserPlus size={16} aria-hidden="true" />
          Add Resident
        </button>
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
      />

      {searchQuery && filteredResidents.length === 0 && (
        <EmptyState preset="no_results" size="sm" />
      )}

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
      <DialogContent className="sm:max-w-[560px]">
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
