'use client';

import { useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BriefcaseBusiness } from 'lucide-react';
import { PropScene } from '@propertypro/ui';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { RecordList, RecordRow } from '@propertypro/ui/components/shared/record-row';
import { Section, SectionError, SectionFooter } from '@propertypro/ui/components/shared/section';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  parseWorkOrderStatus,
  useAmenities,
  useMaintenanceRequests,
  useOperations,
  useReservations,
  useWorkOrders,
  type MaintenanceRequestScope,
} from '@/hooks/use-operations';
import { formatInCommunityTimezone } from '@/lib/utils/format-date';
import { OperationsRow, operationsStatus, ROW_OPEN_BUTTON_CLASS, StatusLead } from './operations-row';

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
const AmenityFormSheet = dynamic(
  () => import('./AmenityFormSheet').then((m) => ({ default: m.AmenityFormSheet })),
  { ssr: false },
);
const RequestDetailSheet = dynamic(
  () => import('./RequestDetailSheet').then((m) => ({ default: m.RequestDetailSheet })),
  { ssr: false },
);
// The two amenity tabs render only when selected, so their code loads then (perf-check budget).
const AmenityList = dynamic(() => import('./AmenityList').then((m) => ({ default: m.AmenityList })));
const ReservationList = dynamic(() => import('./ReservationList').then((m) => ({ default: m.ReservationList })));
const AmenitiesEmpty = dynamic(() => import('./amenities-empty').then((m) => ({ default: m.AmenitiesEmpty })));
const ReservationsEmpty = dynamic(() => import('./amenities-empty').then((m) => ({ default: m.ReservationsEmpty })));

type CreateValue = 'request' | 'work-order' | 'reservation' | 'amenity';

/** Rows each "Load more" adds. */
const LIST_STEP = 20;
// The reservations route clamps `limit` to 100 and the list is not walked like the others.
// ponytail: reservations stop at 100 in view; past that the list shows the note "Showing 100
// of N reservations, latest dates first." Trigger: anyone reports that note while looking for
// an older reservation.
const RESERVATIONS_MAX_LIMIT = 100;

/**
 * `?page=` counts how many steps of rows are shown. Anything that is not a whole number of
 * at least 1 (`abc`, `0`, `-2`, `1.5`) is page 1.
 */
function parsePage(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** `?request=` names the maintenance request whose panel is open; anything else opens none. */
function parseRequestId(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

type OperationsTab = 'all' | 'requests' | 'work-orders' | 'reservations' | 'amenities';

const TABS: ReadonlyArray<{ id: OperationsTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'requests', label: 'Requests' },
  { id: 'work-orders', label: 'Work Orders' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'amenities', label: 'Amenities' },
];

/** What a tab's error message says failed to load. */
const TAB_NOUN: Record<OperationsTab, string> = {
  all: 'operations',
  requests: 'requests',
  'work-orders': 'work orders',
  reservations: 'reservations',
  amenities: 'amenities',
};

/** The kind of record a row of the mixed "All" list is. */
const ITEM_TYPE_LABEL: Record<string, string> = {
  maintenance_request: 'Maintenance request',
  work_order: 'Work order',
};

// Ink, not coral: the selected tab is marked by an underline (design §11.3).
// The same overrides as the Directory and Visitors pages: every one has the
// primitive's variant (none, or data-[state=active]) so tailwind-merge replaces
// rather than stacks.
const TAB_LIST_CLASS =
  'flex w-full justify-start gap-1 rounded-none border-b border-edge-strong bg-transparent p-0';
const TAB_TRIGGER_CLASS =
  'gap-2 rounded-none border-b-2 border-transparent py-2 data-[state=active]:border-content data-[state=active]:bg-transparent data-[state=active]:shadow-none';

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * The sentence under the page title. It names only the sections this viewer
 * has, and says whose records they are: a resident sees their own requests and
 * reservations, and work orders for their own unit (the work-orders route
 * limits a resident to their units).
 */
function describeHub({
  resident,
  requestsEnabled,
  workOrdersEnabled,
  reservationsEnabled,
}: {
  resident: boolean;
  requestsEnabled: boolean;
  workOrdersEnabled: boolean;
  reservationsEnabled: boolean;
}): string | undefined {
  const requests = requestsEnabled ? ['maintenance requests'] : [];
  const workOrders = workOrdersEnabled ? ['work orders'] : [];
  const reservations = reservationsEnabled ? ['amenity reservations'] : [];
  if (!resident) {
    const all = joinWords([...requests, ...workOrders, ...reservations]);
    return all ? `${all.charAt(0).toUpperCase()}${all.slice(1)} for this community.` : undefined;
  }
  const own = joinWords([...requests, ...reservations]);
  if (own && workOrdersEnabled) return `Your ${own}, and work orders for your unit.`;
  if (own) return `Your ${own}.`;
  return workOrdersEnabled ? 'Work orders for your unit.' : undefined;
}

/** The foot of a list's box: "Load more", and a note when there is one. */
function ListFooter({
  more,
  isLoading,
  onMore,
  note,
}: {
  more: boolean;
  isLoading: boolean;
  onMore: () => void;
  note?: string;
}) {
  if (!more && !note) return null;
  return (
    <SectionFooter note={note}>
      {more ? (
        <Button variant="outline" size="sm" onClick={onMore} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </SectionFooter>
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
  /** A resident's own unit, prefilled into the request form. Unset for staff. */
  defaultUnitId?: number;
  defaultUnitLabel?: string;
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
  defaultUnitId,
  defaultUnitLabel,
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
    page: parsePage(searchParams.get('page')),
  };
  // "Load more" grows one list from the top (page 1, a longer limit) rather than
  // swapping in the next page, so earlier rows stay on screen.
  const listLimit = filters.page * LIST_STEP;
  const reservationsLimit = Math.min(listLimit, RESERVATIONS_MAX_LIMIT);

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
      case 'amenities':
        return reservationsEnabled;
    }
  });
  const defaultTab = availableTabs[0]?.id ?? 'requests';
  const selectedTab = availableTabs.some((candidate) => candidate.id === tab) ? tab : defaultTab;

  const createValue = (searchParams.get('create') ?? undefined) as CreateValue | undefined;
  const rawAmenityId = Number(searchParams.get('amenityId'));
  const createAmenityId = Number.isInteger(rawAmenityId) && rawAmenityId > 0 ? rawAmenityId : undefined;
  // True only while a sheet this page opened (pushState) is showing.
  const openedHereRef = useRef(false);
  const openRequestId = parseRequestId(searchParams.get('request'));
  // The same, for the request panel.
  const requestOpenedHereRef = useRef(false);
  // The card button that opened the request panel, so closing it returns focus
  // there. A ref, not state: the panel is gone before Radix asks where to focus.
  const requestOpenerRef = useRef<HTMLElement | null>(null);

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
      page: 1,
      limit: listLimit,
    },
    { enabled: workOrdersEnabled, keepRowsWhileLoadingMore: true },
  );
  const reservationsQuery = useReservations(
    communityId,
    { page: 1, limit: reservationsLimit },
    { enabled: reservationsEnabled, keepRowsWhileLoadingMore: true },
  );
  // Both amenity tabs need the list: Reservations to know whether anything can be booked.
  const amenitiesQuery = useAmenities(communityId, {
    enabled:
      reservationsEnabled
      && (selectedTab === 'reservations' || selectedTab === 'amenities' || createValue === 'amenity'),
  });
  const allAmenities = amenitiesQuery.data ?? [];
  const bookableAmenities = allAmenities.filter((amenity) => amenity.isBookable);
  // Residents see only what they can book; managers see every amenity.
  const visibleAmenities = isAdmin ? allAmenities : bookableAmenities;
  const amenityNames = new Map(allAmenities.map((amenity) => [amenity.id, amenity.name]));
  // An edit link opens only for an amenity in this community's list; it never falls back to "add".
  const editingAmenity = createAmenityId ? allAmenities.find((amenity) => amenity.id === createAmenityId) : undefined;
  const amenityFormReady = createAmenityId === undefined || editingAmenity !== undefined;

  const requestsQuery = useMaintenanceRequests(communityId, {
    scope: requestScope,
    enabled: requestsEnabled,
    keepRowsWhileLoadingMore: true,
    params: {
      status: filters.status,
      priority: filters.priority,
      page: 1,
      limit: listLimit,
    },
  });

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
          isLoading: reservationsQuery.isLoading || amenitiesQuery.isLoading,
          error: reservationsQuery.error ?? amenitiesQuery.error,
          hasData: Boolean(reservationsQuery.data?.data.length),
        };
      case 'amenities':
        return {
          isLoading: amenitiesQuery.isLoading,
          error: amenitiesQuery.error,
          hasData: visibleAmenities.length > 0,
        };
    }
  }, [amenitiesQuery, operationsQuery, requestsQuery, reservationsQuery, selectedTab, visibleAmenities.length, workOrdersQuery]);

  const operationsPartialFailure =
    selectedTab === 'all'
    && operationsQuery.data?.meta.partialFailure === true;

  const activeTabId = `operations-tab-${selectedTab}`;
  const activePanelId = `operations-panel-${selectedTab}`;

  function setTab(nextTab: OperationsTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  }

  interface CtaConfig { label: string; createValue: CreateValue; }

  function getCta(currentTab: OperationsTab): CtaConfig | null {
    if (currentTab === 'reservations') {
      // Only when something can be booked: otherwise the sheet is a form that can't be submitted.
      return reservationsEnabled && bookableAmenities.length > 0
        ? { label: 'Reserve Amenity', createValue: 'reservation' }
        : null;
    }
    if (currentTab === 'amenities') {
      // While the list is empty, its setup state owns "Add amenity" (one filled primary).
      return isAdmin && reservationsEnabled && allAmenities.length > 0
        ? { label: 'Add amenity', createValue: 'amenity' }
        : null;
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
   * The push is history.pushState, not router.push: the server page never
   * reads `create`, and router.push would re-render this force-dynamic page
   * on the server before the sheet could appear. Next syncs the new URL into
   * useSearchParams, and restores the prior entry from its cache on Back.
   * Tab switches use history.replaceState instead, so they neither bloat
   * history nor re-render this force-dynamic page on the server.
   */
  function openCreate(value: CreateValue, options: { amenityId?: number; tab?: OperationsTab } = {}) {
    const { amenityId, tab: nextTab } = options;
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab) params.set('tab', nextTab);
    params.set('create', value);
    if (amenityId) params.set('amenityId', String(amenityId));
    else params.delete('amenityId');
    openedHereRef.current = true;
    window.history.pushState(null, '', `${pathname}?${params.toString()}`);
  }

  /*
   * Back pops the entry `openCreate` pushed — but only if this page pushed
   * one. A visitor can also ARRIVE with `create` already set (the legacy
   * /maintenance/submit redirect sends `create=request`); there, Back would
   * leave Operations for whatever page came before. Strip the param in place
   * instead, the same way tab switches rewrite the URL.
   */
  function closeCreate() {
    if (openedHereRef.current) {
      openedHereRef.current = false;
      router.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    params.delete('amenityId');
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }

  /** Opens a request's panel; Back closes it, exactly as for the create sheets above. */
  function openRequest(requestId: number, opener: HTMLElement) {
    requestOpenerRef.current = opener;
    const params = new URLSearchParams(searchParams.toString());
    params.set('request', String(requestId));
    requestOpenedHereRef.current = true;
    window.history.pushState(null, '', `${pathname}?${params.toString()}`);
  }

  /** A visitor who arrived on `?request=` (a notification, search, an email) gets the param stripped in place. */
  function closeRequest() {
    if (requestOpenedHereRef.current) {
      requestOpenedHereRef.current = false;
      router.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('request');
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }

  /** The panel has no Radix trigger, so without this focus falls to <body> on close. */
  function restoreRequestOpenerFocus(event: Event) {
    const opener = requestOpenerRef.current;
    requestOpenerRef.current = null;
    if (!opener?.isConnected) return;
    event.preventDefault();
    opener.focus();
  }

  const requestsEmptyState = selectedTab === 'requests'
    ? (
      <EmptyState
        size="section"
        illustration={<PropScene size="section" prop="wrench" />}
        title="No maintenance requests yet"
        description={
          requestScope === 'community'
            ? 'Resident submissions will appear here as they come in.'
            : 'Submit a request to start tracking repairs and follow-up here.'
        }
        action={
          cta
            ? (
              <Button size="sm" onClick={() => openCreate(cta.createValue)}>
                {cta.label}
              </Button>
            )
            : undefined
        }
      />
    )
    : <EmptyState preset="no_operations_items" size="section" illustration={<PropScene size="section" prop="wrench" />} />;

  const loadMoreRows = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(filters.page + 1));
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  };

  function retryActiveTab() {
    switch (selectedTab) {
      case 'all':
        void operationsQuery.refetch();
        return;
      case 'requests':
        void requestsQuery.refetch();
        return;
      case 'work-orders':
        void workOrdersQuery.refetch();
        return;
      case 'reservations':
        void reservationsQuery.refetch();
        void amenitiesQuery.refetch();
        return;
      case 'amenities':
        void amenitiesQuery.refetch();
    }
  }

  const reservationsMeta = reservationsQuery.data?.meta;
  const reservationsPastShown = reservationsMeta
    ? reservationsMeta.page * reservationsMeta.limit < reservationsMeta.total
    : false;
  const reservationsAtCap = reservationsMeta ? reservationsMeta.limit >= RESERVATIONS_MAX_LIMIT : false;

  return (
    <>
      <Tabs value={selectedTab} onValueChange={(next) => setTab(next as OperationsTab)}>
        <PageLayout
          template="list"
          banner={
            legacyNotice ? (
              <AlertBanner
                status="info"
                title="Operations is the new home for maintenance."
                description={legacyNotice}
              />
            ) : undefined
          }
          header={
            <PageHeader
              title="Operations"
              icon={<BriefcaseBusiness />}
              description={describeHub({
                resident: requestScope !== 'community',
                requestsEnabled,
                workOrdersEnabled,
                reservationsEnabled,
              })}
              actions={
                cta ? <Button onClick={() => openCreate(cta.createValue)}>{cta.label}</Button> : undefined
              }
            />
          }
          // No side panel and no generated "About". describeAccess words one
          // resource with one resident scope, and this page holds three with
          // different scopes: a resident sees their own requests and
          // reservations and their unit's work orders, but every bookable
          // amenity. No single sentence from it is true here.
          tabs={
            <TabsList aria-label="Operations tabs" className={TAB_LIST_CLASS}>
              {availableTabs.map((candidate) => (
                <TabsTrigger
                  key={candidate.id}
                  value={candidate.id}
                  // Stable ids (not Radix's generated ones): one panel serves every tab.
                  id={`operations-tab-${candidate.id}`}
                  aria-controls={`operations-panel-${candidate.id}`}
                  className={TAB_TRIGGER_CLASS}
                >
                  {candidate.label}
                </TabsTrigger>
              ))}
            </TabsList>
          }
        >
          <TabsContent
            value={selectedTab}
            id={activePanelId}
            aria-labelledby={activeTabId}
            className="mt-0 flex flex-col gap-4"
            // A <section>: the help-capture manifests select `section[role="tabpanel"]`.
            asChild
          >
            <section>
              {activeState.isLoading ? (
                <Section aria-busy="true" aria-label="Loading">
                  <div className="space-y-3 px-4 py-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                </Section>
              ) : null}

              {!activeState.isLoading && activeState.error ? (
                <Section>
                  <SectionError
                    message={`We couldn't load ${TAB_NOUN[selectedTab]}. ${
                      activeState.error instanceof Error && activeState.error.message
                        ? activeState.error.message
                        : 'Please try again.'
                    }`}
                    onRetry={retryActiveTab}
                  />
                </Section>
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
                selectedTab === 'reservations' ? (
                  <ReservationsEmpty
                    isAdmin={isAdmin}
                    amenityCount={allAmenities.length}
                    bookableNames={bookableAmenities.map((amenity) => amenity.name)}
                    onReserve={() => openCreate('reservation')}
                    onAdd={() => openCreate('amenity', { tab: 'amenities' })}
                    onShowAmenities={() => setTab('amenities')}
                  />
                ) : selectedTab === 'amenities' ? (
                  <AmenitiesEmpty isAdmin={isAdmin} onAdd={() => openCreate('amenity')} />
                ) : (
                  requestsEmptyState
                )
              ) : null}

              {!activeState.isLoading && !activeState.error && selectedTab === 'amenities' && activeState.hasData ? (
                <Section>
                  <AmenityList
                    amenities={visibleAmenities}
                    isAdmin={isAdmin}
                    onEdit={(amenityId) => openCreate('amenity', { amenityId })}
                    onReserve={(amenityId) => openCreate('reservation', { amenityId })}
                  />
                </Section>
              ) : null}

              {!activeState.isLoading && !activeState.error && selectedTab === 'all' && operationsQuery.data && activeState.hasData ? (
                <Section>
                  <RecordList>
                    {operationsQuery.data.data.map((item) => {
                      const status = operationsStatus(item.status);
                      const meta = [
                        ITEM_TYPE_LABEL[item.type] ?? item.type.replace(/_/g, ' '),
                        `Created ${formatInCommunityTimezone(item.createdAt, communityTimezone)}`,
                      ];
                      return item.type === 'maintenance_request' && requestsEnabled ? (
                        <OperationsRow
                          key={`${item.type}-${item.id}`}
                          openable
                          lead={<StatusLead status={status} />}
                          title={
                            <p className="text-sm font-medium text-content">
                              <button type="button" className={ROW_OPEN_BUTTON_CLASS} onClick={(e) => openRequest(item.id, e.currentTarget)}>
                                {item.title}
                              </button>
                            </p>
                          }
                          statusWord={status.word}
                          meta={meta}
                        />
                      ) : (
                        <RecordRow
                          key={`${item.type}-${item.id}`}
                          lead={<StatusLead status={status} />}
                          title={item.title}
                          statusWord={status.word}
                          meta={meta}
                        />
                      );
                    })}
                  </RecordList>
                  <ListFooter
                    more={Boolean(operationsQuery.data.meta.cursor)}
                    isLoading={operationsQuery.isFetching}
                    onMore={() => {
                      const params = new URLSearchParams(searchParams.toString());
                      if (operationsQuery.data?.meta.cursor) params.set('cursor', operationsQuery.data.meta.cursor);
                      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
                    }}
                  />
                </Section>
              ) : null}

              {!activeState.isLoading && !activeState.error && selectedTab === 'requests' && requestsQuery.data && activeState.hasData ? (
                <Section>
                  <RecordList>
                    {requestsQuery.data.data.map((request) => {
                      const status = operationsStatus(request.status);
                      return (
                        <OperationsRow
                          key={request.id}
                          openable
                          lead={<StatusLead status={status} />}
                          title={
                            <p className="text-sm font-medium text-content">
                              <button type="button" className={ROW_OPEN_BUTTON_CLASS} onClick={(e) => openRequest(request.id, e.currentTarget)}>
                                {request.title}
                              </button>
                            </p>
                          }
                          preview={request.description}
                          statusWord={status.word}
                        />
                      );
                    })}
                  </RecordList>
                  <ListFooter
                    more={requestsQuery.data.meta.page * requestsQuery.data.meta.limit < requestsQuery.data.meta.total}
                    isLoading={requestsQuery.isFetching}
                    onMore={loadMoreRows}
                  />
                </Section>
              ) : null}

              {!activeState.isLoading && !activeState.error && selectedTab === 'work-orders' && workOrdersQuery.data && activeState.hasData ? (
                <Section>
                  {/* A work order has no record view yet, so its row opens nothing. */}
                  <RecordList>
                    {workOrdersQuery.data.data.map((workOrder) => {
                      const status = operationsStatus(workOrder.status);
                      return (
                        // Not RecordRow: it cuts the description to one line, and
                        // with no record view there would be nowhere to read the rest.
                        <OperationsRow
                          key={workOrder.id}
                          lead={<StatusLead status={status} />}
                          title={<p className="truncate text-sm font-medium text-content">{workOrder.title}</p>}
                          statusWord={status.word}
                        >
                          {workOrder.description ? (
                            <p className="mt-1 max-w-prose whitespace-pre-line text-sm text-content-secondary">
                              {workOrder.description}
                            </p>
                          ) : null}
                        </OperationsRow>
                      );
                    })}
                  </RecordList>
                  <ListFooter
                    more={workOrdersQuery.data.meta.page * workOrdersQuery.data.meta.limit < workOrdersQuery.data.meta.total}
                    isLoading={workOrdersQuery.isFetching}
                    onMore={loadMoreRows}
                  />
                </Section>
              ) : null}

              {!activeState.isLoading && !activeState.error && selectedTab === 'reservations' && reservationsQuery.data && activeState.hasData ? (
                <Section>
                  <ReservationList
                    communityId={communityId}
                    communityTimezone={communityTimezone}
                    reservations={reservationsQuery.data.data}
                    amenityNames={amenityNames}
                  />
                  {/* Keyed on the limit the rows on screen were fetched with, not the one requested: while
                      the last step (80 -> 100) loads, the earlier rows stay as placeholder and the button
                      stays in its Loading state instead of vanishing before the rows arrive. */}
                  <ListFooter
                    more={!reservationsAtCap && reservationsPastShown}
                    isLoading={reservationsQuery.isFetching}
                    onMore={loadMoreRows}
                    // The route sorts by start time, newest first, so the rows past the cap are the earliest.
                    note={
                      reservationsAtCap && reservationsPastShown
                        ? `Showing ${reservationsQuery.data.meta.limit} of ${reservationsQuery.data.meta.total} reservations, latest dates first.`
                        : undefined
                    }
                  />
                </Section>
              ) : null}
            </section>
          </TabsContent>
        </PageLayout>
      </Tabs>

      {openRequestId !== undefined && requestsEnabled ? (
        <RequestDetailSheet
          // A new key per request, so a stale status form never carries over.
          key={openRequestId}
          open
          onClose={closeRequest}
          onCloseAutoFocus={restoreRequestOpenerFocus}
          communityId={communityId}
          requestId={openRequestId}
          communityTimezone={communityTimezone}
          isAdmin={isAdmin}
          userId={userId}
        />
      ) : null}
      {createValue === 'request' && requestsEnabled ? (
        <RequestCreateSheet
          open
          onClose={closeCreate}
          communityId={communityId}
          userId={userId}
          defaultUnitId={defaultUnitId}
          defaultUnitLabel={defaultUnitLabel}
        />
      ) : null}
      {createValue === 'work-order' && isAdmin && workOrdersEnabled ? (
        <WorkOrderCreateSheet
          open
          onClose={closeCreate}
          communityId={communityId}
        />
      ) : null}
      {createValue === 'reservation' && reservationsEnabled ? (
        <ReservationCreateSheet
          open
          onClose={closeCreate}
          communityId={communityId}
          communityTimezone={communityTimezone}
          isAdmin={isAdmin}
          initialAmenityId={createAmenityId}
        />
      ) : null}
      {createValue === 'amenity' && isAdmin && reservationsEnabled && amenityFormReady ? (
        <AmenityFormSheet
          // A new key per amenity, so its fields start from that amenity.
          key={createAmenityId ?? 'new'}
          open
          onClose={closeCreate}
          communityId={communityId}
          amenity={editingAmenity}
        />
      ) : null}
    </>
  );
}
