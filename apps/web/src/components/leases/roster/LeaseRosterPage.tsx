'use client';

/**
 * Leases — the unit roster (Leases v3, design direction 1a).
 *
 * One row per unit, not per lease: the page answers "what is happening in
 * each unit" — occupied, ending, vacant, offline — and puts the one next step
 * on the row. The toolbar filters carry the counts; past leases live behind
 * their own view instead of mixing into the list. Opening a row shows the
 * unit's record in `UnitPanel`.
 *
 * All status logic is in `@/lib/leases/roster-model` (pure, tested); this file
 * is state and layout.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FileText, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { PanelAttention, PanelGlance } from '@propertypro/ui/components/shared/side-panel';
import { RecordList, RecordRow } from '@propertypro/ui/components/shared/record-row';
import {
  Section,
  SectionError,
  SectionFirstRun,
  SectionFooter,
  SectionToolbar,
} from '@propertypro/ui/components/shared/section';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
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
import { PAGE_SIZE, RosterTable } from './RosterTable';
import { UnitPanel } from './UnitPanel';
import { AlertWindowsMenu } from './AlertWindowsMenu';
import { RosterDialogHost } from './dialogs';
import { LEASE_HELP_CATEGORY } from './help-slugs';
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
  const onHelp = onHelpProp ?? (help ? (slug: string) => help.openArticle(LEASE_HELP_CATEGORY, slug) : undefined);
  const data = useLeaseRosterData(communityId, today);
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
  const loaded = !data.isLoading && !data.isError;
  const hasUnits = data.units.length > 0;
  const isFirstRun = loaded && data.leases.length === 0 && hasUnits;
  const newLease = () => setDialog({ kind: 'lease', mode: 'new', unitId: null });

  // The four former tiles. Counts wait for the data, so a tab never shows a
  // zero that only means "not loaded yet".
  const count = (n: number) => (loaded ? n : undefined);
  const tabs = [
    { label: 'All units', value: 'all', count: count(tiles.all.units) },
    { label: 'Renewals due', value: 'expiring', count: count(tiles.renewalsDue.count) },
    { label: 'Vacant', value: 'vacant', count: count(tiles.vacant.count) },
    { label: 'Month-to-month', value: 'm2m', count: count(tiles.monthToMonth.count) },
  ];
  const rentable = tiles.all.units - tiles.all.offline;
  const holdovers = tiles.renewalsDue.holdovers;
  const remaining = total - Math.min(limit, total);
  const canShowMore =
    loaded && ((filter === 'past' && past.length > limit) || (filter !== 'past' && list!.groups.length === 1 && total > limit));

  let body: React.ReactNode;
  if (data.isError) {
    body = <SectionError message="We couldn't load leases. Please try again." onRetry={data.refetch} />;
  } else if (data.isLoading) {
    body = (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  } else if (total === 0) {
    body = (
      <div className="flex flex-col items-start gap-3 px-4 py-6">
        <p className="text-sm text-content">
          {query
            ? `No ${noun[1]} in ${TITLES[filter]} match “${query}”.`
            : {
                all: hasUnits ? 'No units on record.' : 'Leases hang off units, and there are none yet.',
                expiring: `No renewals due in the next ${Math.max(...data.settings.alertWindows)} days.`,
                vacant: 'Every unit is occupied and no move-outs are recorded.',
                m2m: 'No month-to-month leases.',
                past: 'No past leases on record yet.',
              }[filter]}
        </p>
        {!query && filter === 'all' && !hasUnits && (
          // No units means no leases can exist yet: point at where units are added.
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/directory?communityId=${communityId}`}>Add units in the Directory</Link>
          </Button>
        )}
        {query && (
          <Button variant="outline" size="sm" onClick={() => setQuery('')}>
            <X aria-hidden="true" className="size-4" />
            Clear search
          </Button>
        )}
      </div>
    );
  } else if (filter === 'past') {
    body = (
      <RecordList>
        {past.slice(0, limit).map(({ model, lease, people, lastDay }) => (
          <RecordRow
            key={lease.id}
            lead={null}
            title={
              <button
                type="button"
                onClick={() => setPanelUnitId(model.unit.id)}
                className="min-h-11 max-w-full truncate rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus md:min-h-0"
              >
                Unit {model.unit.unitNumber} · {people.map((p) => p.name).join(', ') || 'Unknown resident'}
              </button>
            }
            statusWord={
              lease.status === 'cancelled'
                ? `Cancelled before move-in · was to start ${fmt(lease.startDate)}`
                : lease.endVia === 'transfer'
                  ? `Transferred · ${fmt(lastDay)}`
                  : lease.endVia === 'early' || lease.status === 'terminated'
                    ? `Ended early · ${fmt(lastDay)}`
                    : `Ended ${fmt(lastDay)}`
            }
          />
        ))}
      </RecordList>
    );
  } else {
    body = (
      <RosterTable
        groups={list!.groups}
        today={today}
        selectedUnitId={panelUnitId}
        limit={limit}
        onOpen={setPanelUnitId}
        onAction={onRowAction}
      />
    );
  }

  return (
    <>
      <PageLayout
        template="list"
        records="table"
        header={
          <PageHeader
            title="Leases"
            icon={<FileText />}
            description="Every unit and its lease: who lives there, when the lease ends, and the next step on each renewal."
            // On first run the section offers "Add the first lease" instead.
            actions={
              isFirstRun ? undefined : (
                <Button onClick={newLease}>
                  <Plus className="size-4" aria-hidden="true" />
                  New lease
                </Button>
              )
            }
          />
        }
        panel={{
          template: 'list',
          // Same `tiles` the filter counts read, so the figures cannot disagree.
          glance:
            loaded && hasUnits ? (
              <PanelGlance
                figure={`${tiles.all.occupancyPct.toFixed(1)}%`}
                unit="occupied"
                of={[tiles.all.occupied, rentable]}
                lines={[
                  ['Occupied', `${tiles.all.occupied} of ${rentable} ${rentable === 1 ? 'unit' : 'units'}`],
                  ['Renewals with no offer', String(tiles.renewalsDue.withoutOffer)],
                  ['Moving out', String(tiles.vacant.movingOut)],
                ]}
                source="useLeaseRosterData"
              />
            ) : undefined,
          attention:
            loaded && hasUnits ? (
              holdovers > 0 ? (
                <PanelAttention
                  lead="Past end date"
                  title={`${holdovers} ${holdovers === 1 ? 'lease has' : 'leases have'} run past the end date with no renewal or move-out.`}
                  action={
                    <Button variant="link" size="sm" className="h-auto p-0 md:h-auto" onClick={() => pickFilter('expiring')}>
                      Show renewals due
                    </Button>
                  }
                />
              ) : (
                <PanelAttention none="Leases that run past their end date will show here." />
              )
            ) : undefined,
        }}
      >
        <div className="flex flex-col gap-4">
          {data.hasPartialError && !data.isError && (
            <AlertBanner
              status="warning"
              title="Some lease details are unavailable."
              description="Resident names or renewal offers may be missing. Lease dates and statuses are complete."
            />
          )}

          {isFirstRun && (
            <Section>
              <SectionFirstRun
                title="No leases yet"
                headingLevel={2}
                description="Add the lease for each occupied unit to start tracking renewals, move-outs and deposits. Units without a lease show as vacant."
                action={
                  <Button onClick={newLease}>
                    <Plus aria-hidden="true" className="size-4" />
                    Add the first lease
                  </Button>
                }
              />
            </Section>
          )}

          <Section aria-label={TITLES[filter]} aria-busy={data.isLoading}>
            {data.isError || (loaded && !hasUnits) ? null : (
              <SectionToolbar
                filters={
                  <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                    <QuickFilterTabs
                      tabs={tabs}
                      active={filter}
                      // Pressing the selected filter again returns to all units, as the tiles did.
                      onChange={(v) => pickFilter(v === filter ? 'all' : (v as RosterFilter))}
                      tone="ink"
                    />
                    <div className="flex flex-col gap-3 md:ml-auto md:flex-row md:flex-wrap md:items-center">
                      <div className="relative">
                        <Search
                          aria-hidden="true"
                          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-content-tertiary"
                        />
                        <Input
                          type="search"
                          aria-label="Search units, residents or emails"
                          placeholder="Search unit, resident or email"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setLimit(PAGE_SIZE);
                          }}
                          className="w-full pl-8 md:w-64"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div role="group" aria-label="Sort" className="flex items-center gap-1">
                          {(['unit', 'end'] as const).map((k) => (
                            <Button
                              key={k}
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-pressed={sort === k}
                              onClick={() => setSort(k)}
                              className={cn(sort === k ? 'bg-surface-muted font-semibold text-content' : 'text-content-tertiary')}
                            >
                              {k === 'unit' ? 'Unit' : filter === 'past' ? 'Most recent' : 'Lease end'}
                            </Button>
                          ))}
                        </div>
                        {filter === 'past' ? (
                          <Button variant="outline" size="sm" onClick={() => pickFilter('all')}>
                            Back to all units
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pickFilter('past')}
                            disabled={!loaded || pastCount === 0}
                          >
                            Past leases ({pastCount})
                          </Button>
                        )}
                        <AlertWindowsMenu
                          windows={data.settings.alertWindows}
                          allowResidentsWithoutEmail={data.settings.allowResidentsWithoutEmail}
                          canEdit={isRootManager}
                          actions={actions}
                          onHelp={onHelp}
                        />
                      </div>
                    </div>
                  </div>
                }
              />
            )}

            {body}

            {loaded && hasUnits ? (
              <SectionFooter
                note={
                  <span aria-live="polite">
                    {filter === 'past' && total > limit ? `Showing ${limit} of ` : ''}
                    {`${total} ${total === 1 ? noun[0] : noun[1]}${query ? (total === 1 ? ' matches' : ' match') : ''}`}
                  </span>
                }
              >
                {canShowMore ? (
                  <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, remaining)} more of {remaining}
                  </Button>
                ) : null}
              </SectionFooter>
            ) : null}
          </Section>
        </div>
      </PageLayout>

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
    </>
  );
}
