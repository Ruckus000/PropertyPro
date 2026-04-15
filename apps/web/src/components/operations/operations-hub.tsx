'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMaintenanceRequests,
  useOperations,
  useReservations,
  useWorkOrders,
  type MaintenanceRequestScope,
} from '@/hooks/use-operations';
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
  requestsEnabled: boolean;
  workOrdersEnabled: boolean;
  reservationsEnabled: boolean;
  requestScope: MaintenanceRequestScope;
  requestActionHref?: string;
  requestActionLabel?: string;
}

export function OperationsHub({
  communityId,
  legacyNotice,
  requestsEnabled,
  workOrdersEnabled,
  reservationsEnabled,
  requestScope,
  requestActionHref,
  requestActionLabel,
}: OperationsHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') ?? 'requests') as OperationsTab;
  const summaryEnabled = requestsEnabled && workOrdersEnabled;
  const availableTabs = TABS.filter((candidate) => {
    switch (candidate.id) {
      case 'all':
        return summaryEnabled;
      case 'requests':
        return requestsEnabled;
      case 'work-orders':
        return workOrdersEnabled;
      case 'reservations':
        return reservationsEnabled;
    }
  });
  const defaultTab = availableTabs[0]?.id ?? 'requests';
  const selectedTab = availableTabs.some((candidate) => candidate.id === tab) ? tab : defaultTab;

  const operationsQuery = useOperations(communityId, { limit: 50 }, { enabled: summaryEnabled });
  const workOrdersQuery = useWorkOrders(communityId, undefined, { enabled: workOrdersEnabled });
  const reservationsQuery = useReservations(communityId, { enabled: reservationsEnabled });
  const requestsQuery = useMaintenanceRequests(communityId, {
    scope: requestScope,
    enabled: requestsEnabled,
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

  const activeTabId = `operations-tab-${selectedTab}`;
  const activePanelId = `operations-panel-${selectedTab}`;

  function setTab(nextTab: OperationsTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const requestsDescription = requestScope === 'community'
    ? 'Review community requests, work orders, and reservations from one hub.'
    : 'Track your requests, work orders, and reservations from one hub.';

  const requestsEmptyState = selectedTab === 'requests'
    ? (
      <EmptyState
        title={requestScope === 'community' ? 'No maintenance requests yet' : 'No maintenance requests yet'}
        description={
          requestScope === 'community'
            ? 'Resident submissions will appear here as they come in.'
            : 'Submit a request to start tracking repairs and follow-up here.'
        }
        icon="wrench"
        action={
          requestActionHref && requestActionLabel ? (
            <Button asChild size="sm">
              <Link href={requestActionHref}>{requestActionLabel}</Link>
            </Button>
          ) : undefined
        }
      />
    )
    : <EmptyState preset="no_operations_items" />;

  return (
    <div className="space-y-6">
      {legacyNotice ? (
        <AlertBanner
          status="info"
          title="Operations is the new home for maintenance."
          description={legacyNotice}
        />
      ) : null}

      <PageHeader
        title="Operations"
        description={requestsDescription}
        actions={
          requestActionHref && requestActionLabel && requestsEnabled ? (
            <Button asChild size="sm">
              <Link href={requestActionHref}>{requestActionLabel}</Link>
            </Button>
          ) : undefined
        }
      />

      <nav
        className="flex flex-wrap gap-2 border-b border-edge pb-3"
        aria-label="Operations tabs"
        role="tablist"
      >
        {availableTabs.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            id={`operations-tab-${candidate.id}`}
            aria-selected={candidate.id === selectedTab}
            aria-controls={`operations-panel-${candidate.id}`}
            tabIndex={candidate.id === selectedTab ? 0 : -1}
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

      <section
        id={activePanelId}
        role="tabpanel"
        aria-labelledby={activeTabId}
        tabIndex={0}
        className="space-y-4"
      >
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
          requestsEmptyState
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
      </section>
    </div>
  );
}
