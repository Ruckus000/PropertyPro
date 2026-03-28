'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { ResidentSearchCombobox } from '@/components/shared/ResidentSearchCombobox';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useApproveElectionProxy,
  useBoardElectionProxies,
  useCreateElectionProxy,
  useRejectElectionProxy,
  useRevokeElectionProxy,
} from '@/hooks/use-board';

interface ElectionProxySectionProps {
  communityId: number;
  electionId: number;
  isAdmin: boolean;
  userId: string;
}

function formatUserReference(userId: string): string {
  // TODO: resolve display names from user lookup
  return `User ${userId.slice(0, 8)}`;
}

function getProxyBadge(status: 'pending' | 'approved' | 'rejected' | 'revoked') {
  switch (status) {
    case 'approved':
      return { status: 'completed', label: 'Approved' };
    case 'rejected':
      return { status: 'rejected', label: 'Rejected' };
    case 'revoked':
      return { status: 'canceled', label: 'Revoked' };
    default:
      return { status: 'pending', label: 'Pending' };
  }
}

export function ElectionProxySection({
  communityId,
  electionId,
  isAdmin,
  userId,
}: ElectionProxySectionProps) {
  const { data, isLoading, error } = useBoardElectionProxies(communityId, electionId);
  const createProxy = useCreateElectionProxy(communityId, electionId);
  const approveProxy = useApproveElectionProxy(communityId, electionId);
  const rejectProxy = useRejectElectionProxy(communityId, electionId);
  const revokeProxy = useRevokeElectionProxy(communityId, electionId);

  const [selectedProxyHolderUserId, setSelectedProxyHolderUserId] = useState<string | null>(null);
  const [selectedProxyHolderLabel, setSelectedProxyHolderLabel] = useState('');

  async function handleCreateProxy() {
    if (!selectedProxyHolderUserId) {
      return;
    }

    await createProxy.mutateAsync({ proxyHolderUserId: selectedProxyHolderUserId });
    setSelectedProxyHolderUserId(null);
    setSelectedProxyHolderLabel('');
  }

  return (
    <div className="space-y-4 rounded-xl border border-edge bg-surface-card p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-content">Proxy delegations</h3>
        <p className="text-sm text-content-secondary">Residents can designate a proxy holder for this election, and admins can review pending requests.</p>
      </div>

      {error ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn't load proxy delegations."
          description={error instanceof Error ? error.message : 'Please try again.'}
        />
      ) : null}

      <div className="space-y-3 rounded-lg border border-edge p-3">
        <p className="text-sm font-medium text-content">Create proxy</p>
        {createProxy.error ? (
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn't create this proxy."
            description={createProxy.error instanceof Error ? createProxy.error.message : 'Please try again.'}
          />
        ) : null}
        <ResidentSearchCombobox
          communityId={communityId}
          value={selectedProxyHolderUserId}
          onChange={(id, title) => {
            setSelectedProxyHolderUserId(id);
            setSelectedProxyHolderLabel(title);
          }}
          placeholder="Select proxy holder"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-content-secondary">
            {selectedProxyHolderUserId ? `Selected: ${selectedProxyHolderLabel}` : 'Choose a resident to receive your proxy.'}
          </p>
          <Button
            type="button"
            className="h-11 md:h-9"
            disabled={!selectedProxyHolderUserId || createProxy.isPending}
            onClick={() => void handleCreateProxy()}
          >
            {createProxy.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Create Proxy
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!isLoading && !error && (!data || data.length === 0) ? (
        <EmptyState title="No proxy delegations for this election" description="Proxy assignments will appear here once residents submit them." icon="inbox" size="sm" />
      ) : null}

      {!isLoading && data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((proxy) => {
            const badge = getProxyBadge(proxy.status);
            const canApproveOrReject = isAdmin && proxy.status === 'pending';
            const canRevoke = proxy.status === 'approved' && (isAdmin || proxy.grantorUserId === userId);
            const isMutating = approveProxy.isPending || rejectProxy.isPending || revokeProxy.isPending;

            return (
              <div
                key={proxy.id}
                className="space-y-3 rounded-lg border border-edge p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1 text-sm">
                    <p className="text-content"><span className="font-medium">Grantor:</span> {formatUserReference(proxy.grantorUserId)}</p>
                    <p className="text-content"><span className="font-medium">Proxy holder:</span> {formatUserReference(proxy.proxyHolderUserId)}</p>
                    <p className="text-content-secondary">Unit ID {proxy.grantorUnitId} · Created {new Date(proxy.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={badge.status} label={badge.label} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {canApproveOrReject ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11 md:h-9"
                        disabled={isMutating}
                        onClick={() => void approveProxy.mutateAsync(proxy.id)}
                      >
                        {approveProxy.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-11 md:h-9"
                        disabled={isMutating}
                        onClick={() => void rejectProxy.mutateAsync(proxy.id)}
                      >
                        {rejectProxy.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        Reject
                      </Button>
                    </>
                  ) : null}

                  {canRevoke ? (
                    <Button
                      type="button"
                      variant="outline"
                      className={cn('h-11 md:h-9')}
                      disabled={isMutating}
                      onClick={() => void revokeProxy.mutateAsync(proxy.id)}
                    >
                      {revokeProxy.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
