'use client';

/**
 * Leases — the unit roster (Leases v3, design direction 1a).
 *
 * One row per unit, not per lease: the page answers "what is happening in
 * each unit" — occupied, ending, vacant, offline — and puts the one next step
 * on the row. The tiles double as filters; past leases live behind their own
 * view instead of mixing into the list.
 *
 * All status logic is in `@/lib/leases/roster-model` (pure, tested); this file
 * is state and layout.
 */
import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useLeaseActions, useLeaseRosterData } from '@/hooks/use-lease-roster';
import { useOccupants } from '@/hooks/use-occupants';
import { useHelpWidgetOptional } from '@/components/help/help-widget-provider';
import {
  buildRoster,
  buildTiles,
  filterAndGroup,
  pastLeases,
  type RosterFilter,
  type RosterSort,
  type RosterLease,
  type RowAction,
  type UnitModel,
} from '@/lib/leases/roster-model';
import { RosterTiles } from './RosterTiles';
import { PAGE_SIZE, RosterTable } from './RosterTable';
import { UnitPanel } from './UnitPanel';
import { AlertWindowsMenu } from './AlertWindowsMenu';
import { RosterDialogHost } from './dialogs';
import type { RosterDialog } from './types';

const TITLES: Record<RosterFilter, string> = {
  all: 'All units',
  expiring: 'Renewals due',
  vacant: 'Vacant and moving out',
  m2m: 'Month-to-month leases',
  past: 'Past leases',
};

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function LeaseRosterPage({
  communityId,
  today,
  isRootManager,
  onHelp: onHelpProp,
}: {
  communityId: number;
  /** Today in the community's timezone, resolved on the server. */
  today: string;
  isRootManager: boolean;
  onHelp?: (slug: string) => void;
}) {
  const help = useHelpWidgetOptional();
  // Help links open the article in the app's help panel (Leases v3, Phase 3).
  const onHelp = onHelpProp ?? (help ? (slug: string) => help.openArticle('apartment', slug) : undefined);
  const data = useLeaseRosterData(communityId);
  // Directory household members, only when the community lets them be lease parties.
  const occupantsQuery = useOccupants(communityId, { enabled: data.settings.allowResidentsWithoutEmail });
  const occupants = useMemo(
    () =>
      data.settings.allowResidentsWithoutEmail
        ? (occupantsQuery.data ?? []).map((o) => ({ id: o.id, unitId: o.unitId, fullName: o.fullName, email: o.email }))
        : [],
    [occupantsQuery.data, data.settings.allowResidentsWithoutEmail],
  );
  const actions = useLeaseActions(communityId);
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [sort, setSort] = useState<RosterSort>('unit');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [panelUnitId, setPanelUnitId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<RosterDialog | null>(null);

  const models = useMemo(
    () =>
      buildRoster({
        units: data.units,
        leases: data.leases,
        offers: data.offers,
        directory: data.directory,
        today,
        alertWindows: data.settings.alertWindows,
      }),
    [data.units, data.leases, data.offers, data.directory, today, data.settings.alertWindows],
  );
  const tiles = useMemo(() => buildTiles(models, today, data.settings.alertWindows), [models, today, data.settings.alertWindows]);
  const list = useMemo(
    () => (filter === 'past' ? null : filterAndGroup(models, { filter, sort, query })),
    [models, filter, sort, query],
  );
  const past = useMemo(
    () => (filter === 'past' ? pastLeases(models, { sort, query }, data.directory) : []),
    [models, filter, sort, query, data.directory],
  );
  const pastCount = useMemo(() => models.reduce((n, m) => n + m.past.length, 0), [models]);
  const panelModel = models.find((m) => m.unit.id === panelUnitId) ?? null;

  const pickFilter = (f: RosterFilter) => {
    setFilter(f);
    setSort(f === 'expiring' || f === 'past' ? 'end' : 'unit');
    setLimit(PAGE_SIZE);
  };

  const onRowAction = (m: UnitModel, a: RowAction) => {
    const unitId = m.unit.id;
    switch (a) {
      case 'new_lease':
      case 'pre_lease':
        return setDialog({ kind: 'lease', mode: 'new', unitId });
      case 'send_offer':
      case 'resend_offer':
        return setDialog({ kind: 'offer', unitId });
      case 'record_response':
        return setDialog({ kind: 'offer-response', unitId });
      case 'record_renewal':
        return setDialog({ kind: 'record-renewal', unitId });
      case 'resolve_holdover':
        return setPanelUnitId(unitId);
    }
  };

  const onDone = (message: string, undo?: () => Promise<unknown>) => {
    setDialog(null);
    toast.success(message, {
      duration: 10_000,
      ...(undo
        ? {
            action: {
              label: 'Undo',
              onClick: () =>
                void undo().then(
                  () => toast.success('Change undone'),
                  (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not undo that change'),
                ),
            },
          }
        : {}),
    });
  };

  // One-click panel actions. Each restores exactly what it changed on Undo.
  const onQuickAction = async ({ kind, lease }: { kind: 'cancel-move-out' | 'convert-m2m'; lease: RosterLease }) => {
    const unit = models.find((m) => m.unit.id === lease.unitId)?.unit.unitNumber ?? '';
    try {
      if (kind === 'cancel-move-out') {
        const before = { moveOutOn: lease.moveOutOn, endVia: lease.endVia as 'notice' | 'declined' | 'early' | 'transfer' | 'expiry' | null, endReason: lease.endReason ?? null, noticeReceivedOn: lease.noticeReceivedOn ?? null };
        await actions.updateLease.mutateAsync({ id: lease.id, version: lease.version, moveOutOn: null });
        onDone(`Unit ${unit} stays on its current term.`, () => actions.updateLease.mutateAsync({ id: lease.id, ...before }));
      } else {
        const endDate = lease.endDate;
        await actions.updateLease.mutateAsync({ id: lease.id, version: lease.version, endDate: null });
        onDone(`Unit ${unit} is now month-to-month.`, () => actions.updateLease.mutateAsync({ id: lease.id, endDate }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make that change');
    }
  };

  const total = filter === 'past' ? past.length : (list?.total ?? 0);
  const noun = filter === 'past' ? ['lease', 'leases'] : ['unit', 'units'];
  const shown = filter === 'past' ? Math.min(limit, past.length) : total;
  const isFirstRun = !data.isLoading && data.leases.length === 0;

  return (
    <div className="space-y-4">
      {data.isError && (
        <AlertBanner status="danger" title="We couldn't load leases." description="Refresh the page or try again." />
      )}
      {data.hasPartialError && !data.isError && (
        <AlertBanner
          status="warning"
          title="Some lease details are unavailable."
          description="Resident names or renewal offers may be missing. Lease dates and statuses are complete."
        />
      )}

      {isFirstRun && data.units.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface-card p-6">
          <h2 className="text-base font-semibold text-content">No leases yet</h2>
          <p className="mt-1 max-w-prose text-sm text-content-secondary">
            Add the lease for each occupied unit to start tracking renewals, move-outs and deposits. Units without a lease show as
            vacant.
          </p>
          <Button className="mt-4" onClick={() => setDialog({ kind: 'lease', mode: 'new', unitId: null })}>
            <Plus aria-hidden="true" className="mr-2 size-4" />
            Add the first lease
          </Button>
        </div>
      )}

      {data.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <RosterTiles tiles={tiles} active={filter} onSelect={pickFilter} />
      )}

      <section aria-labelledby="roster-title" className="overflow-hidden rounded-lg border border-edge bg-surface-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-3">
          <div className="mr-auto min-w-0">
            <h2 id="roster-title" className="text-base font-semibold text-content">
              {TITLES[filter]}
            </h2>
            <p className="text-xs text-content-secondary" aria-live="polite">
              {query ? `${total} ${total === 1 ? noun[0] : noun[1]} match` : `${total} ${total === 1 ? noun[0] : noun[1]}`}
            </p>
          </div>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-content-tertiary" />
            <Input
              type="search"
              aria-label="Search units, residents or emails"
              placeholder="Search unit, resident or email"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              className="h-9 w-64 pl-8"
            />
          </div>
          <div role="group" aria-label="Sort" className="inline-flex overflow-hidden rounded-md border border-edge">
            {(['unit', 'end'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={sort === k}
                onClick={() => setSort(k)}
                className={cn(
                  'h-9 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-edge-focus',
                  k === 'end' && 'border-l border-edge',
                  sort === k ? 'bg-surface-muted font-semibold text-content' : 'bg-surface-card text-content-secondary',
                )}
              >
                {k === 'unit' ? 'Unit' : filter === 'past' ? 'Most recent' : 'Lease end'}
              </button>
            ))}
          </div>
          {filter === 'past' ? (
            <Button variant="ghost" size="sm" onClick={() => pickFilter('all')}>
              Back to all units
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => pickFilter('past')} disabled={pastCount === 0}>
              Past leases ({pastCount})
            </Button>
          )}
          <AlertWindowsMenu windows={data.settings.alertWindows} allowResidentsWithoutEmail={data.settings.allowResidentsWithoutEmail} canEdit={isRootManager} actions={actions} onHelp={onHelp} />
          <Button onClick={() => setDialog({ kind: 'lease', mode: 'new', unitId: null })}>
            <Plus aria-hidden="true" className="mr-2 size-4" />
            New lease
          </Button>
        </div>

        {data.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-content-secondary">
              {query
                ? `No ${noun[1]} in ${TITLES[filter]} match “${query}”.`
                : {
                    all: 'No units on record.',
                    expiring: `No renewals due in the next ${Math.max(...data.settings.alertWindows)} days.`,
                    vacant: 'Every unit is occupied and no move-outs are recorded.',
                    m2m: 'No month-to-month leases.',
                    past: 'No past leases on record yet.',
                  }[filter]}
            </p>
            {query && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setQuery('')}>
                <X aria-hidden="true" className="mr-1 size-4" />
                Clear search
              </Button>
            )}
          </div>
        ) : filter === 'past' ? (
          <ul className="divide-y divide-edge-subtle">
            {past.slice(0, limit).map(({ model, lease, people, lastDay }) => (
              <li key={lease.id}>
                <button
                  type="button"
                  onClick={() => setPanelUnitId(model.unit.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-edge-focus"
                >
                  <span className="w-16 text-sm font-semibold tabular-nums text-content">{model.unit.unitNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-content">{people.map((p) => p.name).join(', ') || 'Unknown resident'}</span>
                  <span className="text-xs text-content-secondary">
                    {lease.status === 'cancelled'
                      ? `Cancelled before move-in · was to start ${fmt(lease.startDate)}`
                      : lease.endVia === 'transfer'
                        ? `Transferred · ${fmt(lastDay)}`
                        : lease.endVia === 'early' || lease.status === 'terminated'
                          ? `Ended early · ${fmt(lastDay)}`
                          : `Ended ${fmt(lastDay)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <RosterTable
            groups={list!.groups}
            today={today}
            selectedUnitId={panelUnitId}
            limit={limit}
            onOpen={setPanelUnitId}
            onAction={onRowAction}
          />
        )}

        {((filter === 'past' && past.length > limit) || (filter !== 'past' && list!.groups.length === 1 && total > limit)) && (
          <div className="border-t border-edge px-4 py-3 text-center">
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, total - Math.min(limit, total))} more of {total - Math.min(limit, total)}
            </Button>
          </div>
        )}
        {filter === 'past' && shown < total && <span className="sr-only">{`${shown} of ${total} shown`}</span>}
      </section>

      <UnitPanel
        model={panelModel}
        communityId={communityId}
        today={today}
        directory={data.directory}
        onClose={() => setPanelUnitId(null)}
        onDialog={setDialog}
        onQuickAction={(a) => void onQuickAction(a)}
        onHelp={onHelp}
      />

      <RosterDialogHost
        dialog={dialog}
        communityId={communityId}
        models={models}
        today={today}
        settings={data.settings}
        actions={actions}
        directory={data.directory}
        residents={data.residents}
        occupants={occupants}
        onDone={onDone}
        onClose={() => setDialog(null)}
        onHelp={onHelp}
      />
    </div>
  );
}
