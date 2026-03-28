'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useOperations, useReservations, useWorkOrders } from '@/hooks/use-operations';
import { listMyRequests } from '@/lib/api/maintenance-requests';
import { cn } from '@/lib/utils';

type OperationsTab = 'all' | 'requests' | 'work-orders' | 'reservations';

const TABS: ReadonlyArray<{ id: OperationsTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'requests', label: 'Requests' },
  { id: 'work-orders', label: 'Work Orders' },
  { id: 'reservations', label: 'Reservations' },
];

interface OperationsHubProps {
  communityId: number;
  legacyNotice?: string | null;
}

export function OperationsHub({ communityId, legacyNotice }: OperationsHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') ?? 'requests') as OperationsTab;

  const selectedTab = TABS.some((candidate) => candidate.id === tab) ? tab : 'requests';

  const operationsQuery = useOperations(communityId, { limit: 50 });
  const workOrdersQuery = useWorkOrders(communityId);
  const reservationsQuery = useReservations(communityId);
  const requestsQuery = useQuery({
    queryKey: ['maintenance-requests', 'operations', communityId],
    queryFn: async () => listMyRequests(communityId),
    enabled: communityId > 0,
    staleTime: 45_000,
  });

  useEffect(() => {
    if (!legacyNotice) {
      return;
    }

    // TODO: wire to analytics service
    console.info('[analytics] maintenance_redirect', {
      source: 'legacy_maintenance_page',
    });
  }, [legacyNotice]);

  const activeState = useMemo(() => {
    switch (selectedTab) {
      case 'all':
        return {
          isLoading: operationsQuery.isLoading,
          error: operationsQuery.error,
          hasData: Boolean(operationsQuery.data?.data.length),
        };
      case 'requests':
        return {
          isLoading: requestsQuery.isLoading,
          error: requestsQuery.error,
          hasData: Boolean(requestsQuery.data?.data.length),
        };
      case 'work-orders':
        return {
          isLoading: workOrdersQuery.isLoading,
          error: workOrdersQuery.error,
          hasData: Boolean(workOrdersQuery.data?.length),
        };
      case 'reservations':
        return {
          isLoading: reservationsQuery.isLoading,
          error: reservationsQuery.error,
          hasData: Boolean(reservationsQuery.data?.length),
        };
    }
  }, [operationsQuery, requestsQuery, reservationsQuery, selectedTab, workOrdersQuery]);

  const operationsPartialFailure =
    selectedTab === 'all'
    && operationsQuery.data?.meta.partialFailure === true;

  function setTab(nextTab: OperationsTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {legacyNotice ? (
        <AlertBanner
          status="info"
          title="Operations is the new home for maintenance."
          description={legacyNotice}
        />
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-content">Operations</h1>
        <p className="max-w-2xl text-sm text-content-secondary">
          Track requests, work orders, and reservations from one hub.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-edge pb-3" aria-label="Operations tabs">
        {TABS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setTab(candidate.id)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              candidate.id === selectedTab
                ? 'bg-interactive text-content-inverse shadow-sm'
                : 'bg-surface-muted text-content-secondary hover:bg-surface-hover hover:text-content',
            )}
          >
            {candidate.label}
          </button>
        ))}
      </nav>

      {activeState.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {!activeState.isLoading && activeState.error ? (
        <AlertBanner
          status="danger"
          title="We couldn't load operations."
          description={activeState.error instanceof Error ? activeState.error.message : 'Please try again.'}
        />
      ) : null}

      {operationsPartialFailure ? (
        <AlertBanner
          status="warning"
          title="Some operations sources are temporarily unavailable."
          description={`Unavailable: ${operationsQuery.data?.meta.unavailableSources.join(', ')}`}
          variant="subtle"
        />
      ) : null}

      {!activeState.isLoading && !activeState.error && !activeState.hasData && !operationsPartialFailure ? (
        <EmptyState preset="no_operations_items" />
      ) : null}

      {!activeState.isLoading && !activeState.error && selectedTab === 'all' && operationsQuery.data ? (
        <div className="space-y-4">
          {operationsQuery.data.data.map((item) => (
            <article key={`${item.type}-${item.id}`} className="rounded-xl border border-edge bg-surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                    {item.type.replace('_', ' ')}
                  </p>
                  <h2 className="text-lg font-semibold text-content">{item.title}</h2>
                  <p className="text-xs text-content-tertiary">
                    Created {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!activeState.isLoading && !activeState.error && selectedTab === 'requests' && requestsQuery.data ? (
        <div className="space-y-4">
          {requestsQuery.data.data.map((request) => (
            <article key={request.id} className="rounded-xl border border-edge bg-surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-content">{request.title}</h2>
                  <p className="text-sm text-content-secondary">{request.description}</p>
                </div>
                <StatusBadge status={request.status} />
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!activeState.isLoading && !activeState.error && selectedTab === 'work-orders' && workOrdersQuery.data ? (
        <div className="space-y-4">
          {workOrdersQuery.data.map((workOrder) => (
            <article key={workOrder.id} className="rounded-xl border border-edge bg-surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-content">{workOrder.title}</h2>
                  {workOrder.description ? (
                    <p className="text-sm text-content-secondary">{workOrder.description}</p>
                  ) : null}
                </div>
                <StatusBadge status={workOrder.status} />
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!activeState.isLoading && !activeState.error && selectedTab === 'reservations' && reservationsQuery.data ? (
        <div className="space-y-4">
          {reservationsQuery.data.map((reservation) => (
            <article key={reservation.id} className="rounded-xl border border-edge bg-surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-content">
                    Reservation #{reservation.id}
                  </h2>
                  <p className="text-sm text-content-secondary">
                    {new Date(reservation.startTime).toLocaleString()} to {new Date(reservation.endTime).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={reservation.status} />
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
