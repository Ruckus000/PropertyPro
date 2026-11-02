'use client';

/**
 * The audit trail page body, built for a manager with one question:
 *
 *   search (people and things) → Show choices + When → plain-sentence list
 *   grouped by day → side panel with what changed.
 *
 * Narrowing to a person or item is the same page filtered, not a separate
 * page: the name appears as the page's subject and Download becomes Print
 * record. The URL holds view, period, scope and the open entry, so a link
 * reopens exactly what was on screen.
 */
import { useCallback, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Download, EyeOff, Lock, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { AUDIT_VIEW_LABELS, periodLabel, type AuditPeriod, type AuditView } from '@/lib/audit/audit-catalog';
import {
  AuditQueryError,
  DEFAULT_AUDIT_QUERY,
  parseAuditQuery,
  writeAuditQuery,
  type AuditQueryState,
} from '@/lib/audit/audit-query';
import type { DescribeContext } from '@/lib/audit/describe-event';
import { itemName } from '@/lib/audit/describe-event';
import type { AuditScope } from '@/lib/audit/types';
import { auditTrailParams, useAuditTrail } from '@/hooks/use-audit-trail';
import { AuditPeriodPicker, AuditSearch, AuditViewPicker, itemTypeLabel } from './AuditFilters';
import { AuditEventList, buildAuditListItems, type AuditListItem } from './AuditEntry';
import { AuditDetailSheet } from './AuditDetailSheet';

interface AuditTrailViewerProps {
  communityId: number;
  /** The community's IANA time zone; every time on the page is shown in it. */
  timeZone: string;
  /**
   * Keep view, scope and the open entry in the address bar (the default), so a
   * copied link reopens the same view. Embedded copies, like the compliance
   * page's history dialog, pass false and keep it in memory instead.
   */
  syncUrl?: boolean;
}

function readState(params: URLSearchParams): AuditQueryState {
  try {
    return parseAuditQuery((key) => params.get(key));
  } catch (err) {
    if (err instanceof AuditQueryError) return DEFAULT_AUDIT_QUERY;
    throw err;
  }
}

/** View state from the URL, or from memory when the viewer is embedded. */
function useAuditViewState(syncUrl: boolean) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [local, setLocal] = useState<{ state: AuditQueryState; entry: string | null }>({
    state: DEFAULT_AUDIT_QUERY,
    entry: null,
  });
  const urlState = useMemo(() => readState(new URLSearchParams(searchParams.toString())), [searchParams]);

  const navigate = useCallback(
    (next: AuditQueryState, entry: string | null = null) => {
      if (!syncUrl) {
        setLocal({ state: next, entry });
        return;
      }
      const params = writeAuditQuery(new URLSearchParams(searchParams.toString()), next);
      if (entry) params.set('entry', entry);
      else params.delete('entry');
      // replaceState, not router.replace: Next keeps useSearchParams in sync
      // with it, and it skips a server render on every click. Replace, not
      // push, so Back leaves the page instead of walking every filter.
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [pathname, searchParams, syncUrl],
  );

  return syncUrl
    ? { state: urlState, openEntry: searchParams.get('entry'), navigate }
    : { state: local.state, openEntry: local.entry, navigate };
}

export function AuditTrailViewer({ communityId, timeZone, syncUrl = true }: AuditTrailViewerProps) {
  const { state, openEntry, navigate } = useAuditViewState(syncUrl);
  // The label of a scope picked from search, until the server's arrives.
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);

  const { auditData, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useAuditTrail(
    communityId,
    state,
  );

  const setView = (view: AuditView) => navigate({ ...state, view });
  const setPeriod = (period: AuditPeriod) => navigate({ ...state, period });
  const setScope = (scope: AuditScope | null, label: string | null) => {
    setPickedLabel(label);
    // Narrowing to one person or thing means "show me everything about it".
    navigate({ ...state, scope, view: scope ? 'all' : 'important' });
  };

  const ctx: DescribeContext = useMemo(
    () => ({ users: auditData?.users ?? {}, resources: auditData?.resources ?? {}, timeZone }),
    [auditData, timeZone],
  );
  const items = useMemo(() => buildAuditListItems(auditData?.entries ?? [], ctx), [auditData, ctx]);
  const selected = openEntry ? items.find((i) => i.entries.some((e) => String(e.id) === openEntry)) ?? null : null;

  // The subject's name: server's, else what was picked, else what the rows recorded.
  const firstEntry = auditData?.entries[0];
  const scopeLabel =
    auditData?.scopeLabel ??
    pickedLabel ??
    (state.scope?.kind === 'item' && firstEntry ? itemName(firstEntry, ctx) : null);

  const apiParams = auditTrailParams(communityId, state);
  const csvHref = `/api/v1/audit-trail?${apiParams.toString()}&format=csv`;
  const printHref = `/audit-trail/print?${apiParams.toString()}${scopeLabel ? `&label=${encodeURIComponent(scopeLabel)}` : ''}`;

  const intro = state.scope
    ? `Everything that happened ${state.scope.kind === 'person' ? 'by or to' : 'to'} ${scopeLabel ?? `this ${state.scope.kind === 'person' ? 'person' : itemTypeLabel(state.scope.entityType).toLowerCase()}`}, newest first.`
    : 'A permanent record of what happened in your community and who did it.';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {state.scope && <p className="truncate font-display text-2xl text-content">{scopeLabel ?? 'Selected'}</p>}
          <p className="text-base text-content-secondary">{intro}</p>
        </div>
        {state.scope ? (
          <Button asChild className="shrink-0">
            <a href={printHref} target="_blank" rel="noopener">
              <Printer aria-hidden="true" />
              Print record
            </a>
          </Button>
        ) : (
          <Button asChild variant="outline" className="shrink-0">
            <a href={csvHref} download>
              <Download aria-hidden="true" />
              Download
            </a>
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <AuditSearch communityId={communityId} scope={state.scope} scopeLabel={scopeLabel} onScope={setScope} />
          </div>
          <AuditPeriodPicker period={state.period} onPeriod={setPeriod} />
        </div>
        <AuditViewPicker view={state.view} onView={setView} />
      </div>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <AuditListSkeleton />
        ) : isError ? (
          <AlertBanner
            status="danger"
            className="mt-4"
            title="We couldn’t load the audit trail"
            description="No entries are lost. Try again in a moment."
            action={
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <AuditEmpty state={state} onView={setView} onPeriod={setPeriod} hidden={auditData?.hiddenRoutineCount ?? 0} />
        ) : (
          <>
            <AuditEventList
              items={items}
              timeZone={timeZone}
              selectedKey={selected?.key ?? null}
              onOpen={(item: AuditListItem) => navigate(state, item.key)}
              onScope={setScope}
            />
            {hasNextPage && (
              <div className="pt-4">
                <Button variant="outline" onClick={() => void fetchNextPage()} loading={isFetchingNextPage}>
                  Show older activity
                </Button>
              </div>
            )}
            <AuditFooter state={state} hidden={auditData?.hiddenRoutineCount ?? null} onView={setView} />
          </>
        )}
      </div>

      <AuditDetailSheet
        communityId={communityId}
        item={selected}
        ctx={ctx}
        onClose={() => navigate(state, null)}
        onScope={setScope}
      />
    </div>
  );
}

function AuditFooter({
  state,
  hidden,
  onView,
}: {
  state: AuditQueryState;
  hidden: number | null;
  onView: (view: AuditView) => void;
}) {
  return (
    <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-edge pt-4 text-sm text-content-secondary">
      {state.view === 'important' && hidden !== null && hidden > 0 ? (
        <>
          <EyeOff className="size-4" aria-hidden="true" />
          <span>
            {hidden.toLocaleString('en-US')} routine {hidden === 1 ? 'event' : 'events'}, like document views and automatic
            charges, {hidden === 1 ? 'is' : 'are'} hidden.
          </span>
          <button
            type="button"
            onClick={() => onView('all')}
            className="rounded-sm font-medium text-content-link underline underline-offset-4 hover:text-content-link-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Show everything
          </button>
        </>
      ) : (
        <>
          <Lock className="size-4" aria-hidden="true" />
          <span>Entries are permanent. Nobody can edit or delete them.</span>
        </>
      )}
    </p>
  );
}

function AuditEmpty({
  state,
  hidden,
  onView,
  onPeriod,
}: {
  state: AuditQueryState;
  hidden: number;
  onView: (view: AuditView) => void;
  onPeriod: (period: AuditPeriod) => void;
}) {
  const when = periodLabel(state.period).toLowerCase();
  const what = state.view === 'important' || state.view === 'all' ? 'Nothing' : `Nothing in “${AUDIT_VIEW_LABELS[state.view]}”`;
  const title = state.period === 'all' ? `${what} yet` : `${what} in the ${when}`;
  const description =
    state.view === 'important' && hidden > 0
      ? `${hidden.toLocaleString('en-US')} routine ${hidden === 1 ? 'event is' : 'events are'} hidden. Show everything to see ${hidden === 1 ? 'it' : 'them'}, or look further back.`
      : state.period === 'all'
        ? 'Activity appears here automatically as people post documents, send notices and change access.'
        : 'Try looking further back, or show everything.';

  return (
    <EmptyState
      icon="inbox"
      size="sm"
      className="mt-4"
      title={title}
      description={description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {state.view !== 'all' && (
            <Button variant="outline" onClick={() => onView('all')}>
              Show everything
            </Button>
          )}
          {state.period !== 'all' && (
            <Button variant="outline" onClick={() => onPeriod(state.period === '365' ? 'all' : '365')}>
              Look further back
            </Button>
          )}
        </div>
      }
    />
  );
}

function AuditListSkeleton() {
  return (
    <div className="pt-5" aria-label="Loading activity">
      <Skeleton className="mb-3 h-4 w-24" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
