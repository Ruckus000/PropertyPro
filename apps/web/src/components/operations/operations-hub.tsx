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
  type WorkOrderListItem,
} from '@/hooks/use-operations';
import { cn } from '@/lib/utils';
import { formatInCommunityTimezone } from '@/lib/utils/format-date';

type OperationsTab = 'all' | 'requests' | 'work-orders' | 'reservations';

const TABS: ReadonlyArray<{ id: OperationsTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'requests', label: 'Requests' },
  { id: 'work-orders', label: 'Work Orders' },
  { id: 'reservations', label: 'Reservations' },
];

function LoadMoreButton({
  onClick,
  isLoading,
  visible,
}: {
  onClick: () => void;
  isLoading: boolean;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="flex justify-center pt-2">
      <Button variant="outline" size="sm" onClick={onClick} disabled={isLoading}>
        {isLoading ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}

interface OperationsHubProps {
  communityId: number;
  legacyNotice?: string | null;
  requestsEnabled: boolean;
  workOrdersEnabled: boolean;
  reservationsEnabled: boolean;
  requestScope: MaintenanceRequestScope;
  requestActionHref?: string;
  requestActionLabel?: string;
  communityTimezone: string;
  initialTab?: string;
  initialFilters?: {
    status?: string;
    priority?: string;
    unitId?: string;
    q?: string;
    cursor?: string;
    page?: string;
  };
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
  communityTimezone,
  // initialTab/initialFilters are accepted for SSR hydration symmetry,
  // but we read live state from useSearchParams() to stay in sync with
  // URL changes after mount. The server's initial values are the same
  // values useSearchParams() exposes on first client render, so no
  // hydration divergence.
  initialTab: _initialTab,
  initialFilters: _initialFilters,
}: OperationsHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') ?? 'requests') as OperationsTab;

  // URL contract: `q` is accepted and round-tripped (e.g. by the command
  // palette) so deep links survive, but Phase 1 hooks don't accept a free-
  // text search parameter. Phase 2 wires `q` into a text-search filter.
  const filters = {
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    unitId: searchParams.get('unitId') ? Number(searchParams.get('unitId')) : undefined,
    _q: searchParams.get('q') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    page: searchParams.get('page') ? Math.max(1, Number(searchParams.get('page'))) : 1,
  };

  const summaryEnabled = requestsEnabled && workOrdersEnabled && requestScope === 'community';
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

  const operationsQuery = useOperations(
    communityId,
    {
      limit: 50,
      cursor: filters.cursor,
      status: filters.status,
      priority: filters.priority,
      unitId: filters.unitId,
    },
    { enabled: summaryEnabled },
  );
  const workOrdersQuery = useWorkOrders(
    communityId,
    { status: filters.status as WorkOrderListItem['status'], unitId: filters.unitId },
    { enabled: workOrdersEnabled },
  );
  const reservationsQuery = useReservations(communityId, { enabled: reservationsEnabled });
  const requestsQuery = useMaintenanceRequests(communityId, {
    scope: requestScope,
    enabled: requestsEnabled,
    params: {
      status: filters.status,
      priority: filters.priority,
      page: filters.page,
      limit: 20,
    },
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
                      Created {formatInCommunityTimezone(item.createdAt, communityTimezone)}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              </article>
            ))}
            <LoadMoreButton
              visible={Boolean(operationsQuery.data?.meta.cursor)}
              isLoading={operationsQuery.isFetching}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                if (operationsQuery.data?.meta.cursor) params.set('cursor', operationsQuery.data.meta.cursor);
                // eslint-disable-next-line no-console
                console.info('[analytics] operations_pagination_loaded', { tab: 'all', mechanism: 'cursor' });
                router.replace(`${pathname}?${params.toString()}`);
              }}
            />
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
            <LoadMoreButton
              visible={
                requestsQuery.data
                  ? requestsQuery.data.meta.page * requestsQuery.data.meta.limit < requestsQuery.data.meta.total
                  : false
              }
              isLoading={requestsQuery.isFetching}
              onClick={() => {
                const nextPage = (filters.page ?? 1) + 1;
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', String(nextPage));
                // eslint-disable-next-line no-console
                console.info('[analytics] operations_pagination_loaded', { tab: 'requests', mechanism: 'page' });
                router.replace(`${pathname}?${params.toString()}`);
              }}
            />
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
            {workOrdersQuery.data && workOrdersQuery.data.length > 0 ? (
              <p className="pt-2 text-xs text-content-tertiary">
                Showing {workOrdersQuery.data.length} result{workOrdersQuery.data.length === 1 ? '' : 's'}. Use filters above to narrow further.
              </p>
            ) : null}
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
                      {formatInCommunityTimezone(reservation.startTime, communityTimezone)} to {formatInCommunityTimezone(reservation.endTime, communityTimezone)}
                    </p>
                  </div>
                  <StatusBadge status={reservation.status} />
                </div>
              </article>
            ))}
            {reservationsQuery.data && reservationsQuery.data.length > 0 ? (
              <p className="pt-2 text-xs text-content-tertiary">
                Showing {reservationsQuery.data.length} result{reservationsQuery.data.length === 1 ? '' : 's'}. Use filters above to narrow further.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
