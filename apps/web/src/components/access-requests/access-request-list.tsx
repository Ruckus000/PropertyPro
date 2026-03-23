'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { AlertBanner } from '@/components/shared/alert-banner';
import { ApproveDialog } from '@/components/access-requests/approve-dialog';
import { DenyDialog } from '@/components/access-requests/deny-dialog';
import { cn } from '@/lib/utils';

/* ─────── Types ─────── */

export interface AccessRequest {
  id: number;
  communityId: number;
  fullName: string;
  email: string;
  claimedUnitIdentifier: string | null;
  claimedUnitId: number | null;
  isUnitOwner: boolean;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
}

/* ─────── API helper ─────── */

async function fetchAccessRequests(communityId: number): Promise<AccessRequest[]> {
  const response = await fetch(`/api/v1/access-requests?communityId=${communityId}`);
  if (!response.ok) {
    throw new Error('Failed to load access requests');
  }
  const json = await response.json() as { data: AccessRequest[] };
  return json.data;
}

/* ─────── Helpers ─────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RoleBadge({ role }: { role: 'owner' | 'tenant' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        role === 'owner'
          ? 'bg-status-info-bg text-status-info'
          : 'bg-status-neutral-bg text-status-neutral',
      )}
    >
      {role === 'owner' ? 'Owner' : 'Tenant'}
    </span>
  );
}

function UnitMatchIndicator({
  claimedUnitIdentifier,
  claimedUnitId,
}: {
  claimedUnitIdentifier: string | null;
  claimedUnitId: number | null;
}) {
  if (!claimedUnitIdentifier) {
    return <span className="text-xs text-content-tertiary">—</span>;
  }

  if (claimedUnitId) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-success">
        <CheckCircle2 size={12} aria-hidden="true" />
        Unit exists
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-status-warning">
      <XCircle size={12} aria-hidden="true" />
      Unknown unit
    </span>
  );
}

/* ─────── Main component ─────── */

interface AccessRequestListProps {
  communityId: number;
}

export function AccessRequestList({ communityId }: AccessRequestListProps) {
  const queryClient = useQueryClient();

  const {
    data: requests,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['access-requests', communityId],
    queryFn: () => fetchAccessRequests(communityId),
  });

  const handleActionSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['access-requests', communityId] });
  };

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  /* ── Error ── */
  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load access requests"
        description={
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred. Please try again.'
        }
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
          >
            Retry
          </button>
        }
      />
    );
  }

  /* ── Empty ── */
  if (!requests || requests.length === 0) {
    return (
      <EmptyState
        icon="inbox"
        title="No pending access requests yet"
        description="No pending access requests. Share your community's signup link to get started."
      />
    );
  }

  /* ── Success ── */
  return (
    <div className="overflow-hidden rounded-md border border-border-default">
      {/* Table header */}
      <div className="hidden grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-4 border-b border-border-default bg-surface-muted px-4 py-3 md:grid">
        <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Name</span>
        <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Email</span>
        <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Claimed Unit</span>
        <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Role</span>
        <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Submitted</span>
        <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Actions</span>
      </div>

      {/* Rows */}
      <ul role="list" className="divide-y divide-border-default">
        {requests.map((request) => (
          <li key={request.id} className="px-4 py-4">
            {/* Mobile layout */}
            <div className="flex flex-col gap-3 md:hidden">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-content">{request.fullName}</p>
                  <p className="text-sm text-content-secondary">{request.email}</p>
                </div>
                <RoleBadge role={request.isUnitOwner ? 'owner' : 'tenant'} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-content-secondary">
                {request.claimedUnitIdentifier && (
                  <span>Unit {request.claimedUnitIdentifier}</span>
                )}
                <UnitMatchIndicator
                  claimedUnitIdentifier={request.claimedUnitIdentifier}
                  claimedUnitId={request.claimedUnitId}
                />
                <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
                  <Clock size={12} aria-hidden="true" />
                  {formatDate(request.createdAt)}
                </span>
              </div>
              <div className="flex gap-2">
                <ApproveDialog
                  requestId={request.id}
                  requestName={request.fullName}
                  onSuccess={handleActionSuccess}
                />
                <DenyDialog
                  requestId={request.id}
                  requestName={request.fullName}
                  onSuccess={handleActionSuccess}
                />
              </div>
            </div>

            {/* Desktop layout */}
            <div className="hidden grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-4 md:grid">
              <span className="truncate text-sm font-medium text-content">{request.fullName}</span>
              <span className="truncate text-sm text-content-secondary">{request.email}</span>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-content">
                  {request.claimedUnitIdentifier ?? '—'}
                </span>
                <UnitMatchIndicator
                  claimedUnitIdentifier={request.claimedUnitIdentifier}
                  claimedUnitId={request.claimedUnitId}
                />
              </div>
              <RoleBadge role={request.isUnitOwner ? 'owner' : 'tenant'} />
              <span className="text-sm text-content-secondary">{formatDate(request.createdAt)}</span>
              <div className="flex items-center gap-2">
                <ApproveDialog
                  requestId={request.id}
                  requestName={request.fullName}
                  onSuccess={handleActionSuccess}
                />
                <DenyDialog
                  requestId={request.id}
                  requestName={request.fullName}
                  onSuccess={handleActionSuccess}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
