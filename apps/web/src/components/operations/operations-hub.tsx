'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  parseWorkOrderStatus,
  useMaintenanceRequests,
  useOperations,
  useReservations,
  useWorkOrders,
  type MaintenanceRequestScope,
} from '@/hooks/use-operations';
import { cn } from '@/lib/utils';
import { formatInCommunityTimezone } from '@/lib/utils/format-date';

// Create-sheets are loaded on demand (when the user opens one) so the
// initial Operations Hub bundle does not pay for them up front.
const RequestCreateSheet = dynamic(
  () => import('./RequestCreateSheet').then((m) => ({ default: m.RequestCreateSheet })),
  { ssr: false },
);
const WorkOrderCreateSheet = dynamic(
  () => import('./WorkOrderCreateSheet').then((m) => ({ default: m.WorkOrderCreateSheet })),
  { ssr: false },
);
const ReservationCreateSheet = dynamic(
  () => import('./ReservationCreateSheet').then((m) => ({ default: m.ReservationCreateSheet })),
  { ssr: false },
);

/**
 * OPERATIONS_HUB_CREATE_SHEETS env var (read at module load):
 *   - default / 'on': CTA buttons open drawer sheets via ?create= URL param.
 *   - 'off': CTAs render as Phase 1 <Link>s to legacy routes; ?create= is ignored.
 *
 * Escape-hatch scope: this flag disables Phase 2's drawer-opening behavior only.
 * It does NOT restore Phase 1's pre-redirect submit pages — Phase 1 already rewrote
 * /maintenance/submit and /maintenance/inbox as redirect-only shims back to
 * Operations. Under this rollback, CTAs render as Links, but clicking them still
 * lands on Operations. The flag is useful for suppressing the drawer during an
 * incident; a full revert to the pre-Phase-1 submit form requires a git revert.
 *
 * Client bundles inline this at build time; rollback requires redeploy.
 */
const CREATE_SHEETS_ENABLED = process.env.OPERATIONS_HUB_CREATE_SHEETS !== 'off';

type CreateValue = 'request' | 'work-order' | 'reservation';

function legacyHrefFor(value: CreateValue, communityId: number): string {
  if (value === 'request') return `/maintenance/submit?communityId=${communityId}`;
  if (value === 'work-order') return `/communities/${communityId}/operations?tab=work-orders`;
  return `/communities/${communityId}/operations?tab=reservations`;
}

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
  isAdmin: boolean;
  userId: string;
  communityTimezone: string;
  initialTab?: string;
  initialFilters?: {
    status?: string;
    priority?: string;
    unitId?: string;
    q?: string;
    cursor?: string;
    page?: string;
    create?: string;
  };
}

export function OperationsHub({
  communityId,
  legacyNotice,
  requestsEnabled,
  workOrdersEnabled,
  reservationsEnabled,
  requestScope,
  isAdmin,
  userId,
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

  const createValue = (searchParams.get('create') ?? undefined) as CreateValue | undefined;

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
    {
      // Work orders accept a narrower status union than maintenance requests
      // (no 'submitted', etc). Parse the URL string rather than casting — if
      // the user arrives with a non-WO status in the URL, we drop the filter
      // instead of sending a bogus value to the API.
      status: parseWorkOrderStatus(filters.status),
      unitId: filters.unitId,
      page: filters.page,
      limit: 20,
    },
    { enabled: workOrdersEnabled },
  );
  const reservationsQuery = useReservations(
    communityId,
    { page: filters.page, limit: 20 },
    { enabled: reservationsEnabled },
  );
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
          hasData: Boolean(workOrdersQuery.data?.data.length),
        };
      case 'reservations':
        return {
          isLoading: reservationsQuery.isLoading,
          error: reservationsQuery.error,
          hasData: Boolean(reservationsQuery.data?.data.length),
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

  interface CtaConfig { label: string; createValue: CreateValue; }

  function getCta(currentTab: OperationsTab): CtaConfig | null {
    if (currentTab === 'reservations') {
      return reservationsEnabled ? { label: 'Reserve Amenity', createValue: 'reservation' } : null;
    }
    if (currentTab === 'work-orders') {
      return isAdmin && workOrdersEnabled
        ? { label: 'Dispatch Work Order', createValue: 'work-order' }
        : null;
    }
    if (currentTab === 'requests') {
      return requestsEnabled ? { label: 'Submit Request', createValue: 'request' } : null;
    }
    // 'all' tab
    if (isAdmin && workOrdersEnabled) return { label: 'Dispatch Work Order', createValue: 'work-order' };
    if (requestsEnabled) return { label: 'Submit Request', createValue: 'request' };
    return null;
  }

  const cta = getCta(selectedTab);

  /**
   * Spec §5.2 requires "Back button closes" — opening a drawer must add a
   * history entry so the browser back button pops it off. We push on open,
   * and the close callback calls router.back() to pop the same entry.
   * Tab switches continue to use router.replace (unchanged from Phase 1)
   * so they don't bloat history.
   */
  function openCreate(value: CreateValue) {
    if (!CREATE_SHEETS_ENABLED) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('create', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function closeCreate() {
    router.back();
  }

  const requestsDescription = requestScope === 'community'
    ? 'Review community requests, work orders, and reservations from one hub.'
    : 'Track your requests, work orders, and reservations from one hub.';

  const requestsEmptyState = selectedTab === 'requests'
    ? (
      <EmptyState
        title="No maintenance requests yet"
        description={
          requestScope === 'community'
            ? 'Resident submissions will appear here as they come in.'
            : 'Submit a request to start tracking repairs and follow-up here.'
        }
        icon="wrench"
        action={
          cta && CREATE_SHEETS_ENABLED
            ? (
              <Button size="sm" onClick={() => openCreate(cta.createValue)}>
                {cta.label}
              </Button>
            )
            : undefined
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
          cta
            ? CREATE_SHEETS_ENABLED
              ? (
                <Button size="sm" onClick={() => openCreate(cta.createValue)}>
                  {cta.label}
                </Button>
              )
              : (
                <Button asChild size="sm">
                  <Link href={legacyHrefFor(cta.createValue, communityId)}>{cta.label}</Link>
                </Button>
              )
            : undefined
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
                // TODO: wire to analytics service
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
                const nextPage = filters.page + 1;
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', String(nextPage));
                // TODO: wire to analytics service
                // eslint-disable-next-line no-console
                console.info('[analytics] operations_pagination_loaded', { tab: 'requests', mechanism: 'page' });
                router.replace(`${pathname}?${params.toString()}`);
              }}
            />
          </div>
        ) : null}

        {!activeState.isLoading && !activeState.error && selectedTab === 'work-orders' && workOrdersQuery.data ? (
          <div className="space-y-4">
            {workOrdersQuery.data.data.map((workOrder) => (
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
            <LoadMoreButton
              visible={
                workOrdersQuery.data
                  ? workOrdersQuery.data.meta.page * workOrdersQuery.data.meta.limit < workOrdersQuery.data.meta.total
                  : false
              }
              isLoading={workOrdersQuery.isFetching}
              onClick={() => {
                const nextPage = filters.page + 1;
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', String(nextPage));
                // eslint-disable-next-line no-console
                console.info('[analytics] operations_pagination_loaded', { tab: 'work-orders', mechanism: 'page' });
                router.replace(`${pathname}?${params.toString()}`);
              }}
            />
          </div>
        ) : null}

        {!activeState.isLoading && !activeState.error && selectedTab === 'reservations' && reservationsQuery.data ? (
          <div className="space-y-4">
            {reservationsQuery.data.data.map((reservation) => (
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
            <LoadMoreButton
              visible={
                reservationsQuery.data
                  ? reservationsQuery.data.meta.page * reservationsQuery.data.meta.limit < reservationsQuery.data.meta.total
                  : false
              }
              isLoading={reservationsQuery.isFetching}
              onClick={() => {
                const nextPage = filters.page + 1;
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', String(nextPage));
                // eslint-disable-next-line no-console
                console.info('[analytics] operations_pagination_loaded', { tab: 'reservations', mechanism: 'page' });
                router.replace(`${pathname}?${params.toString()}`);
              }}
            />
          </div>
        ) : null}
      </section>

      {CREATE_SHEETS_ENABLED && createValue === 'request' && requestsEnabled ? (
        <RequestCreateSheet
          open
          onClose={closeCreate}
          communityId={communityId}
          userId={userId}
        />
      ) : null}
      {CREATE_SHEETS_ENABLED && createValue === 'work-order' && isAdmin && workOrdersEnabled ? (
        <WorkOrderCreateSheet
          open
          onClose={closeCreate}
          communityId={communityId}
        />
      ) : null}
      {CREATE_SHEETS_ENABLED && createValue === 'reservation' && reservationsEnabled ? (
        <ReservationCreateSheet
          open
          onClose={closeCreate}
          communityId={communityId}
          communityTimezone={communityTimezone}
        />
      ) : null}
    </div>
  );
}
