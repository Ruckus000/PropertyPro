'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, DollarSign, MoreHorizontal, Plus, Upload } from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { PageHeader } from '@/components/shared/page-header';
import { PageHeaderHelpButton } from '@/components/shared/page-header-help-button';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AccessRequestList, accessRequestsQueryOptions } from '@/components/access-requests/access-request-list';
import type { ResidentFormSubmitValues } from '@/components/residents/resident-form';
import { useDeleteUnit, useUnits } from '@/hooks/use-units';
import { useDelinquency } from '@/hooks/use-finance';
import { usePastDueRule } from '@/hooks/use-past-due-rule';
import {
  useBatchInvite,
  useInviteResident,
  useRemoveResident,
  useResendInvitation,
  useResidentsList,
} from '@/hooks/use-residents-management';
import { useIsDesktop } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { ConfirmDialog } from '@/components/pm/site-editor-v3/ConfirmDialog';
import { AddResidentDialog } from '@/components/residents/add-resident-dialog';
import { DirectorySheet } from './directory-sheet';
import { EditResidentDialog } from './edit-resident-dialog';
import { PastDueRuleDialog } from './past-due-rule-dialog';
import { SendDocumentsDialog } from './send-documents-dialog';
import { UnitFormDialog } from './unit-form-dialog';
import { DirectoryToolbar, type FilterToken, type StatusOption, type UnitsView } from './directory-toolbar';
import {
  ANY_OVERDUE_RULE,
  NO_BUILDING_KEY,
  buildDirectoryUnits,
  buildResidentRows,
  buildingLabelOf,
  computeOverview,
  describeRule,
  describeSendResults,
  filterResidents,
  filterUnits,
  listBuildings,
  matchesResidentSearch,
  matchesResidentStatus,
  matchesUnitSearch,
  matchesUnitStatus,
  plural,
  type ResidentStatusFilter,
  type UnitStatusFilter,
} from './directory-model';
import { OverviewStrip } from './overview-strip';
import { ResidentDetailPanel } from './resident-detail-panel';
import { ResidentsTable } from './residents-table';
import { UnitDetailPanel } from './unit-detail-panel';
import { UnitCards, UnitsByBuilding, UnitsSplitList } from './units-views';

// ponytail: this route sits ~14 KiB under the 1220 KiB hard per-route budget
// (perf:check). Lazy-loading the dialogs below via next/dynamic was measured
// and made things WORSE: it reshuffled shared chunks and pushed the web
// aggregate budget (1490 KiB, routes this page is not even in) over. Re-measure
// both numbers before adding weight here.
export type DirectoryTab = 'units' | 'residents';

interface DirectoryPageClientProps {
  communityId: number;
  communityType: CommunityType;
  hasOwnerRole: boolean;
  isAdmin: boolean;
  canWrite: boolean;
  canSeeBalances: boolean;
  /** documents:write — gates every "Send documents" entry point. */
  canSendDocuments: boolean;
  initialTab: DirectoryTab;
}

type Panel = { kind: 'unit'; id: number } | { kind: 'resident'; id: string } | { kind: 'requests' } | null;

type Confirm =
  | { kind: 'delete-unit'; unitId: number }
  | { kind: 'remove-resident'; userId: string }
  | { kind: 'bulk-invite'; userIds: string[]; skippedActive: number }
  | null;

const VIEW_STORAGE_KEY = 'propertypro:directory:units-view';
const VIEWS: readonly UnitsView[] = ['cards', 'building', 'split'];

const UNIT_STATUS_LABEL: Record<UnitStatusFilter, string> = {
  all: 'All units',
  past_due: 'Past due',
  vacant: 'Vacant',
  no_owner: 'No owner on file',
};

const RESIDENT_STATUS_LABEL: Record<ResidentStatusFilter, string> = {
  all: 'All',
  owners: 'Owners',
  tenants: 'Tenants',
  board: 'Board',
  not_active: 'Not activated',
};

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

function NoMatches({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-edge-strong px-6 py-12 text-center">
      <span className="text-sm font-medium text-content">No {noun} match</span>
      <span className="text-xs text-content-secondary">Try a different search or filter.</span>
      <button
        type="button"
        onClick={onClear}
        className={cn('mt-2 h-9 rounded-md px-3 text-xs font-medium text-content-link hover:bg-interactive-subtle', FOCUS)}
      >
        Clear filters
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function DirectoryPageClient({
  communityId,
  communityType,
  hasOwnerRole,
  isAdmin,
  canWrite,
  canSeeBalances,
  canSendDocuments,
  initialTab,
}: DirectoryPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const wide = useIsDesktop();

  const rawTab = searchParams.get('tab');
  const tab: DirectoryTab = !isAdmin ? 'units' : rawTab === 'residents' ? 'residents' : rawTab === 'units' ? 'units' : initialTab;

  /* ── UI state ── */
  const [unitQuery, setUnitQuery] = useState('');
  const [residentQuery, setResidentQuery] = useState('');
  const [unitStatus, setUnitStatus] = useState<UnitStatusFilter>('all');
  const [residentStatus, setResidentStatus] = useState<ResidentStatusFilter>('all');
  const [building, setBuilding] = useState<string | null>(null);
  const [view, setView] = useState<UnitsView>('cards');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [panel, setPanel] = useState<Panel>(null);
  const [splitId, setSplitId] = useState<number | null>(null);
    const [addResident, setAddResident] = useState<{ open: boolean; unitId: number | null }>({ open: false, unitId: null });
  const [sendInvitation, setSendInvitation] = useState(true);
  const [inviteWarning, setInviteWarning] = useState<{ userId: string; name: string } | null>(null);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [unitForm, setUnitForm] = useState<{ open: boolean; unitId: number | null }>({ open: false, unitId: null });
  const [editResidentId, setEditResidentId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // Where focus returns after a confirmation (it has no Radix trigger).
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  // `nonce` remounts the dialog per send, so each send gets its own sendId.
  const [sendDocs, setSendDocs] = useState<{ userIds: string[]; label: string; nonce: number } | null>(null);

  // Search is filtered client-side; deferring keeps typing responsive on
  // large communities without a fixed debounce.
  const deferredUnitQuery = useDeferredValue(unitQuery);
  const deferredResidentQuery = useDeferredValue(residentQuery);

  // View preference is per browser (localStorage), read after mount so the
  // server render and hydration agree.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored && (VIEWS as readonly string[]).includes(stored)) setView(stored as UnitsView);
    } catch {
      // Storage blocked (private mode): keep the default.
    }
  }, []);

  const changeView = useCallback((next: UnitsView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice just won't persist.
    }
  }, []);

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', next === 'residents' ? 'residents' : 'units');
      setSelection(new Set());
      // `replace`, not `push`: Back should leave the page, not walk the tabs.
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /* ── Data ── */
  const unitsQ = useUnits(communityId);
  const residentsQ = useResidentsList(communityId, { enabled: isAdmin });
  const delinquencyQ = useDelinquency(communityId, { enabled: canSeeBalances });
  const ruleQ = usePastDueRule(communityId, { enabled: canSeeBalances });
  const requestsQ = useQuery({ ...accessRequestsQueryOptions(communityId), enabled: isAdmin });

  // A refused or failed delinquency read hides finance UI rather than showing
  // every unit as "nothing overdue".
  // Without the rule we cannot say what "past due" means here, so the same
  // hide-on-failure applies to it.
  const balancesVisible = canSeeBalances && delinquencyQ.isSuccess && ruleQ.isSuccess;
  const rule = ruleQ.data ?? ANY_OVERDUE_RULE;
  const residents = isAdmin ? residentsQ.data ?? null : null;

  const dirUnits = useMemo(
    () =>
      buildDirectoryUnits(unitsQ.data ?? [], residents, balancesVisible ? (delinquencyQ.data ?? null) : null, {
        hasOwnerRole,
        canSeeResidents: residents !== null,
      }, rule),
    [unitsQ.data, residents, balancesVisible, delinquencyQ.data, hasOwnerRole, rule],
  );
  const residentRows = useMemo(() => buildResidentRows(residents ?? [], dirUnits), [residents, dirUnits]);
  const stats = useMemo(() => computeOverview(dirUnits, residentRows), [dirUnits, residentRows]);
  const buildings = useMemo(() => listBuildings(dirUnits), [dirUnits]);
  const unitOptions = useMemo(
    () =>
      dirUnits.map((u) => ({
        id: u.id,
        label: u.buildingKey === NO_BUILDING_KEY ? u.unitNumber : `${u.unitNumber} · ${u.buildingLabel}`,
      })),
    [dirUnits],
  );

  // A building filter pointing at a building that no longer exists is dropped.
  const activeBuilding = building !== null && buildings.some((b) => b.key === building) ? building : null;

  const filteredUnits = useMemo(
    () => filterUnits(dirUnits, { status: unitStatus, building: activeBuilding, query: deferredUnitQuery }),
    [dirUnits, unitStatus, activeBuilding, deferredUnitQuery],
  );
  const filteredResidents = useMemo(
    () => filterResidents(residentRows, { status: residentStatus, building: activeBuilding, query: deferredResidentQuery }),
    [residentRows, residentStatus, activeBuilding, deferredResidentQuery],
  );

  // Selection only ever acts on rows that are on screen: filtering or searching
  // narrows it rather than leaving hidden residents selected.
  const visibleSelection = useMemo(
    () => filteredResidents.filter((r) => selection.has(r.userId)),
    [filteredResidents, selection],
  );
  const visibleSelectedIds = useMemo(() => new Set(visibleSelection.map((r) => r.userId)), [visibleSelection]);

  /* ── Filter options (counts ignore the status filter itself) ── */
  const unitStatusOptions = useMemo((): StatusOption<UnitStatusFilter>[] => {
    const base = dirUnits.filter(
      (u) => (activeBuilding === null || u.buildingKey === activeBuilding) && matchesUnitSearch(u, deferredUnitQuery),
    );
    const statuses: UnitStatusFilter[] = [
      'all',
      ...(balancesVisible ? (['past_due'] as const) : []),
      'vacant',
      ...(hasOwnerRole && residents !== null ? (['no_owner'] as const) : []),
    ];
    return statuses.map((s) => ({
      value: s,
      label: UNIT_STATUS_LABEL[s],
      count: base.filter((u) => matchesUnitStatus(u, s)).length,
    }));
  }, [dirUnits, activeBuilding, deferredUnitQuery, balancesVisible, hasOwnerRole, residents]);

  const residentStatusOptions = useMemo((): StatusOption<ResidentStatusFilter>[] => {
    const base = residentRows.filter(
      (r) =>
        (activeBuilding === null || r.unit?.buildingKey === activeBuilding) &&
        matchesResidentSearch(r, deferredResidentQuery),
    );
    const statuses: ResidentStatusFilter[] = ['all', ...(hasOwnerRole ? (['owners'] as const) : []), 'tenants', 'board', 'not_active'];
    return statuses.map((s) => ({
      value: s,
      label: RESIDENT_STATUS_LABEL[s],
      count: base.filter((r) => matchesResidentStatus(r, s)).length,
    }));
  }, [residentRows, activeBuilding, deferredResidentQuery, hasOwnerRole]);

  const clearFilters = useCallback(() => {
    setBuilding(null);
    if (tab === 'units') {
      setUnitStatus('all');
      setUnitQuery('');
    } else {
      setResidentStatus('all');
      setResidentQuery('');
    }
  }, [tab]);

  const tokens: FilterToken[] = [];
  const status = tab === 'units' ? unitStatus : residentStatus;
  if (status !== 'all') {
    tokens.push({
      key: 'status',
      label: tab === 'units' ? UNIT_STATUS_LABEL[unitStatus] : RESIDENT_STATUS_LABEL[residentStatus],
      onRemove: () => (tab === 'units' ? setUnitStatus('all') : setResidentStatus('all')),
    });
  }
  if (activeBuilding !== null) {
    tokens.push({ key: 'building', label: buildingLabelOf(activeBuilding), onRemove: () => setBuilding(null) });
  }

  /* ── Actions ── */
  const resend = useResendInvitation(communityId);
  const sendInvite = useCallback(
    async (userId: string) => {
      setInvitingUserId(userId);
      try {
        await resend.mutateAsync(userId);
        toast.success('Invitation sent.');
        setInviteWarning((w) => (w?.userId === userId ? null : w));
        void queryClient.invalidateQueries({ queryKey: ['residents', communityId] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not send the invitation.');
      } finally {
        setInvitingUserId(null);
      }
    },
    [resend, queryClient, communityId],
  );

  const inviteResident = useInviteResident(communityId);
  const handleAddResident = useCallback(
    async (values: ResidentFormSubmitValues) => {
      setInviteWarning(null);
      let result;
      try {
        result = await inviteResident.mutateAsync({ values, sendInvitation });
      } catch {
        return; // Shown in the dialog via inviteResident.error (e.g. duplicate email).
      }
      void queryClient.invalidateQueries({ queryKey: ['residents', communityId] });
      if (result.invitationFailed) {
        setInviteWarning({ userId: result.userId, name: values.fullName });
      } else {
        toast.success('Resident added.');
      }
      setAddResident({ open: false, unitId: null });
    },
    [inviteResident, sendInvitation, queryClient, communityId],
  );

  const openAddResident = useCallback((unitId: number | null) => {
    inviteResident.reset();
    setAddResident({ open: true, unitId });
  }, [inviteResident]);

  const openSendDocs = useCallback(
    (userIds: string[], label: string) => setSendDocs({ userIds, label, nonce: Date.now() }),
    [],
  );

  const openUnit = useCallback((id: number) => setPanel({ kind: 'unit', id }), []);
  const openResident = useCallback((id: string) => setPanel({ kind: 'resident', id }), []);

  const askConfirm = useCallback((next: NonNullable<Confirm>) => {
    confirmReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirm(next);
  }, []);

  const deleteUnit = useDeleteUnit(communityId);
  const removeResident = useRemoveResident(communityId);
  const batchInvite = useBatchInvite(communityId);

  const runConfirm = useCallback(async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'delete-unit') {
        await deleteUnit.mutateAsync(confirm.unitId);
        setPanel(null);
        toast.success('Unit deleted.');
      } else if (confirm.kind === 'remove-resident') {
        await removeResident.mutateAsync(confirm.userId);
        setPanel((p) => (p?.kind === 'resident' ? null : p));
        toast.success('Resident removed.');
      } else {
        const results = await batchInvite.mutateAsync(confirm.userIds);
        const sent = results.filter((r) => r.status === 'sent').length;
        const failed = results.length - sent;
        const parts = [`${plural(sent, 'invitation')} sent`];
        if (failed) parts.push(`${failed} failed`);
        if (confirm.skippedActive) parts.push(`${confirm.skippedActive} skipped (already active)`);
        (failed ? toast.warning : toast.success)(`${parts.join(', ')}.`);
        setSelection(new Set());
      }
    } catch (err) {
      // The server's message says why (e.g. "its ledger balance is not zero").
      toast.error(err instanceof Error ? err.message : 'That did not work. Please try again.');
    }
  }, [confirm, deleteUnit, removeResident, batchInvite]);

  const toggleSelected = useCallback((userId: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleBuilding = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ── Panel resolution (a unit deleted or a resident removed closes it) ── */
  const panelUnit = panel?.kind === 'unit' ? dirUnits.find((u) => u.id === panel.id) ?? null : null;
  const panelResident = panel?.kind === 'resident' ? residentRows.find((r) => r.userId === panel.id) ?? null : null;
  const panelOpen = panel?.kind === 'requests' || panelUnit !== null || panelResident !== null;

  // Split view: the pane follows the selection while it stays visible, else the
  // first visible unit, else nothing — never a unit the filters hid.
  const effectiveView: UnitsView = view === 'split' && !wide ? 'cards' : view;
  const splitSelected =
    filteredUnits.find((u) => u.id === splitId) ?? filteredUnits[0] ?? null;

  // The unit the panel (drawer or split pane) is showing.
  const panelUnitId = panelUnit?.id ?? (effectiveView === 'split' && tab === 'units' ? splitSelected?.id ?? null : null);
  const unitPanelProps = {
    communityId,
    hasOwnerRole,
    isAdmin,
    canSeeBalances: balancesVisible,
    onOpenResident: openResident,
    onAddResident: (unitId: number) => openAddResident(unitId),
    onSendInvite: sendInvite,
    invitingUserId,
    canWrite,
    onEditUnit: () => setUnitForm({ open: true, unitId: panelUnitId }),
    onDeleteUnit: () => panelUnitId !== null && askConfirm({ kind: 'delete-unit', unitId: panelUnitId }),
    onEditResident: (userId: string) => setEditResidentId(userId),
    onRemoveResident: (userId: string) => askConfirm({ kind: 'remove-resident', userId }),
    onSendDocuments: canSendDocuments ? openSendDocs : undefined,
  };

  const editResident = editResidentId ? residentRows.find((r) => r.userId === editResidentId) ?? null : null;

  const confirmCopy = (() => {
    if (confirm?.kind === 'delete-unit') {
      const u = dirUnits.find((x) => x.id === confirm.unitId);
      return {
        title: `Delete unit ${u?.unitNumber ?? ''}?`,
        description:
          "This can't be undone. A unit that still has residents, a ledger balance or open violations can't be deleted.",
        confirmLabel: 'Delete unit',
        destructive: true,
      };
    }
    if (confirm?.kind === 'remove-resident') {
      const r = residentRows.find((x) => x.userId === confirm.userId);
      const lastOwner =
        hasOwnerRole && r?.isUnitOwner && r.unit !== null && r.unit.owners.length === 1;
      return {
        title: `Remove ${r?.displayName ?? 'this resident'}?`,
        description: `They lose portal access to this community.${
          lastOwner ? ` Unit ${r!.unit!.unitNumber} will have no owner on file.` : ''
        }`,
        confirmLabel: 'Remove resident',
        destructive: true,
      };
    }
    if (confirm?.kind === 'bulk-invite') {
      return {
        title: `Send ${plural(confirm.userIds.length, 'invitation')}?`,
        description: `Each person gets an email with a link to set up portal access.${
          confirm.skippedActive ? ` ${plural(confirm.skippedActive, 'resident')} already signed in and will be skipped.` : ''
        }`,
        confirmLabel: 'Send invitations',
        destructive: false,
      };
    }
    return { title: '', description: '', confirmLabel: 'Confirm', destructive: false };
  })();

  /* ── Render ── */
  const unitsLoading = unitsQ.isLoading;
  const residentsLoading = isAdmin && residentsQ.isLoading;
  const primaryLabel = tab === 'units' ? 'Add unit' : 'Add resident';
  const showPrimary = tab === 'units' ? canWrite && (unitsQ.data?.length ?? 0) > 0 : (residentRows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Directory" hideHelpButton />

      {isAdmin && !unitsLoading && !residentsLoading && !unitsQ.isError ? (
        <OverviewStrip
          stats={stats}
          requestCount={requestsQ.data ? requestsQ.data.length : null}
          canSeeBalances={balancesVisible}
          onOccupancy={() => {
            setTab('units');
            setUnitStatus('vacant');
          }}
          onPastDue={() => {
            setTab('units');
            setUnitStatus('past_due');
          }}
          onPortal={() => {
            setTab('residents');
            setResidentStatus('not_active');
          }}
          onRequests={() => setPanel({ kind: 'requests' })}
        />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          {isAdmin ? (
            <TabsList aria-label="Directory sections" className="h-12 flex-nowrap md:h-10">
              <TabsTrigger value="units" className="h-full gap-2 px-3.5">
                Units
                <span className="text-xs font-medium text-content-tertiary">{dirUnits.length}</span>
              </TabsTrigger>
              <TabsTrigger value="residents" className="h-full gap-2 px-3.5">
                Residents
                <span className="text-xs font-medium text-content-tertiary">{residentRows.length}</span>
              </TabsTrigger>
            </TabsList>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-2">
            {tab === 'residents' || balancesVisible ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More actions"
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-md border border-edge text-content hover:bg-surface-hover md:h-10 md:w-10',
                      FOCUS,
                    )}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  {tab === 'residents' ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/import-residents?communityId=${communityId}`}>
                        <Upload size={16} className="mr-2 text-content-tertiary" aria-hidden="true" />
                        Import from CSV
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setRuleOpen(true)}>
                      <DollarSign size={16} className="mr-2 text-content-tertiary" aria-hidden="true" />
                      Past-due rule
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {showPrimary ? (
              <button
                type="button"
                aria-label={primaryLabel}
                onClick={() => (tab === 'units' ? setUnitForm({ open: true, unitId: null }) : openAddResident(null))}
                className={cn(
                  'inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-md bg-interactive px-0 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:h-10 md:px-4',
                  FOCUS,
                )}
              >
                <Plus size={16} aria-hidden="true" />
                <span className="hidden md:inline">{primaryLabel}</span>
              </button>
            ) : null}
            <PageHeaderHelpButton />
          </div>
        </div>

        {inviteWarning ? (
          <div
            role="alert"
            className="flex flex-wrap items-start gap-3 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3.5 text-status-warning"
          >
            <AlertTriangle size={20} className="shrink-0" aria-hidden="true" />
            <div className="flex min-w-60 flex-1 flex-col gap-0.5">
              <strong className="text-sm font-semibold">Invitation not sent</strong>
              <span className="text-sm">
                {inviteWarning.name} was added, but the invitation email failed to send.
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => void sendInvite(inviteWarning.userId)}
                disabled={invitingUserId === inviteWarning.userId}
                className={cn('h-10 rounded-md border border-edge bg-surface-card px-3.5 text-sm font-medium text-content disabled:opacity-60', FOCUS)}
              >
                Resend invite
              </button>
              <button
                type="button"
                onClick={() => setInviteWarning(null)}
                className={cn('h-10 rounded-md border border-edge bg-surface-card px-3.5 text-sm font-medium text-content-secondary', FOCUS)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {/* ─────────── Units ─────────── */}
        <TabsContent value="units" className="mt-0 flex flex-col gap-4">
          {unitsLoading || residentsLoading ? (
            <ListSkeleton />
          ) : unitsQ.isError ? (
            <AlertBanner
              status="danger"
              title="We couldn't load units"
              description="An unexpected error occurred. Please try again."
              action={
                <button
                  type="button"
                  onClick={() => void unitsQ.refetch()}
                  className={cn('h-10 rounded-md bg-interactive px-4 text-sm font-medium text-content-inverse hover:bg-interactive-hover', FOCUS)}
                >
                  Retry
                </button>
              }
            />
          ) : dirUnits.length === 0 ? (
            <EmptyState
              icon="building"
              title="No units yet"
              description={
                canWrite
                  ? 'Add your first unit to start managing residents, leases, and compliance.'
                  : 'No units have been added to this community yet.'
              }
              action={
                canWrite ? (
                  <button
                    type="button"
                    onClick={() => setUnitForm({ open: true, unitId: null })}
                    className={cn('inline-flex h-11 items-center gap-2 rounded-md bg-interactive px-4 text-sm font-medium text-content-inverse hover:bg-interactive-hover', FOCUS)}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Add unit
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              {isAdmin && residentsQ.isError ? (
                <AlertBanner
                  status="warning"
                  title="Residents didn't load"
                  description="Units are shown without who lives in them."
                  action={
                    <button
                      type="button"
                      onClick={() => void residentsQ.refetch()}
                      className={cn('h-10 rounded-md border border-edge bg-surface-card px-3.5 text-sm font-medium text-content', FOCUS)}
                    >
                      Retry
                    </button>
                  }
                />
              ) : null}
              <DirectoryToolbar
                query={unitQuery}
                onQueryChange={setUnitQuery}
                placeholder="Search unit or owner"
                tokens={tokens}
                statusOptions={unitStatusOptions}
                status={unitStatus}
                onStatusChange={setUnitStatus}
                buildings={buildings}
                building={activeBuilding}
                onBuildingChange={setBuilding}
                onClearAll={clearFilters}
                resultsLabel={`Show ${plural(filteredUnits.length, 'unit')}`}
                statusNote={
                  balancesVisible ? (
                    <span>
                      Past due means {describeRule(rule)}.{' '}
                      <button
                        type="button"
                        onClick={() => setRuleOpen(true)}
                        className={cn('font-semibold text-content-link hover:underline', FOCUS)}
                      >
                        Change rule
                      </button>
                    </span>
                  ) : undefined
                }
                view={effectiveView}
                onViewChange={changeView}
              />
              <p className="sr-only" role="status">
                {plural(filteredUnits.length, 'unit')} shown
              </p>
              {filteredUnits.length === 0 ? (
                <NoMatches noun="units" onClear={clearFilters} />
              ) : effectiveView === 'cards' ? (
                <UnitCards units={filteredUnits} hasOwnerRole={hasOwnerRole} canSeeBalances={balancesVisible} onOpenUnit={openUnit} />
              ) : effectiveView === 'building' ? (
                <UnitsByBuilding
                  units={filteredUnits}
                  hasOwnerRole={hasOwnerRole}
                  canSeeBalances={balancesVisible}
                  onOpenUnit={openUnit}
                  collapsed={collapsed}
                  onToggleBuilding={toggleBuilding}
                />
              ) : (
                <div className="grid h-[calc(100dvh-16rem)] min-h-[32rem] grid-cols-[300px_minmax(0,1fr)] gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                  <UnitsSplitList
                    units={filteredUnits}
                    hasOwnerRole={hasOwnerRole}
                    canSeeBalances={balancesVisible}
                    selectedId={splitSelected?.id ?? null}
                    onOpenUnit={setSplitId}
                  />
                  <div className="min-h-0 overflow-hidden rounded-lg border border-edge" aria-live="polite">
                    {splitSelected ? <UnitDetailPanel unit={splitSelected} {...unitPanelProps} /> : null}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ─────────── Residents (admins only) ─────────── */}
        {isAdmin ? (
          <TabsContent value="residents" className="mt-0 flex flex-col gap-4">
            {residentsLoading ? (
              <ListSkeleton />
            ) : residentsQ.isError ? (
              <AlertBanner
                status="danger"
                title="We couldn't load residents"
                description="An unexpected error occurred. Please try again."
                action={
                  <button
                    type="button"
                    onClick={() => void residentsQ.refetch()}
                    className={cn('h-10 rounded-md bg-interactive px-4 text-sm font-medium text-content-inverse hover:bg-interactive-hover', FOCUS)}
                  >
                    Retry
                  </button>
                }
              />
            ) : residentRows.length === 0 ? (
              <EmptyState
                preset="no_residents"
                action={
                  <div className="flex flex-col items-center gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => openAddResident(null)}
                      className={cn('inline-flex h-11 items-center gap-2 rounded-md bg-interactive px-4 text-sm font-medium text-content-inverse hover:bg-interactive-hover', FOCUS)}
                    >
                      <Plus size={16} aria-hidden="true" />
                      Add resident
                    </button>
                    <Link
                      href={`/dashboard/import-residents?communityId=${communityId}`}
                      className={cn('inline-flex h-11 items-center gap-2 rounded-md border border-edge bg-surface-card px-4 text-sm font-medium text-content hover:bg-surface-hover', FOCUS)}
                    >
                      <Upload size={16} aria-hidden="true" />
                      Import CSV
                    </Link>
                  </div>
                }
              />
            ) : (
              <>
                <DirectoryToolbar
                  query={residentQuery}
                  onQueryChange={setResidentQuery}
                  placeholder="Search name, email, unit or phone"
                  tokens={tokens}
                  statusOptions={residentStatusOptions}
                  status={residentStatus}
                  onStatusChange={setResidentStatus}
                  buildings={buildings}
                  building={activeBuilding}
                  onBuildingChange={setBuilding}
                  onClearAll={clearFilters}
                  resultsLabel={`Show ${plural(filteredResidents.length, 'resident')}`}
                />
                <p className="sr-only" role="status">
                  {plural(filteredResidents.length, 'resident')} shown
                </p>
                {filteredResidents.length === 0 ? (
                  <NoMatches noun="residents" onClear={clearFilters} />
                ) : (
                  <>
                    {visibleSelection.length > 0 ? (
                      <div className="sticky bottom-3 z-10 order-last flex flex-wrap items-center gap-2 rounded-md border border-edge-strong bg-surface-card py-1.5 pl-4 pr-2 shadow-e1 md:top-0 md:order-none">
                        <span className="mr-2 text-sm font-semibold" role="status">
                          {visibleSelection.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const toInvite = visibleSelection.filter((r) => r.portalStatus !== 'active');
                            if (toInvite.length === 0) {
                              toast.info('Everyone selected has already signed in.');
                              return;
                            }
                            askConfirm({
                              kind: 'bulk-invite',
                              userIds: toInvite.map((r) => r.userId),
                              skippedActive: visibleSelection.length - toInvite.length,
                            });
                          }}
                          className={cn('inline-flex h-11 items-center gap-1.5 rounded-md border border-edge bg-surface-card px-3 text-xs font-medium text-content hover:bg-surface-hover md:h-9', FOCUS)}
                        >
                          Resend invites
                        </button>
                        {canSendDocuments ? (
                          <button
                            type="button"
                            onClick={() =>
                              openSendDocs(
                                visibleSelection.map((r) => r.userId),
                                visibleSelection.length === 1
                                  ? visibleSelection[0]!.displayName
                                  : plural(visibleSelection.length, 'resident'),
                              )
                            }
                            className={cn('inline-flex h-11 items-center gap-1.5 rounded-md border border-edge bg-surface-card px-3 text-xs font-medium text-content hover:bg-surface-hover md:h-9', FOCUS)}
                          >
                            Send documents
                          </button>
                        ) : null}
                        <CsvExportButton
                          headers={['Name', 'Email', 'Phone', 'Unit', 'Building', 'Type', 'Board', 'Portal']}
                          rows={visibleSelection.map((r) => ({
                            Name: r.displayName,
                            Email: r.email ?? '',
                            Phone: r.phone ?? '',
                            Unit: r.unit?.unitNumber ?? '',
                            Building: r.unit?.buildingLabel ?? '',
                            Type: hasOwnerRole && r.isUnitOwner ? 'Owner' : 'Tenant',
                            Board: r.designation === 'board_president' ? 'President' : r.designation === 'board_member' ? 'Member' : '',
                            Portal: r.portalStatus === 'active' ? 'Active' : r.portalStatus === 'invited' ? 'Invited' : 'Not invited',
                          }))}
                          filename="residents"
                          className={cn('inline-flex h-11 items-center gap-1.5 rounded-md border border-edge bg-surface-card px-3 text-xs font-medium text-content hover:bg-surface-hover md:h-9', FOCUS)}
                        />
                        <button
                          type="button"
                          onClick={() => setSelection(new Set())}
                          className={cn('ml-auto h-11 rounded-md px-3 text-xs font-medium text-content-secondary hover:bg-surface-hover md:h-9', FOCUS)}
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                    <ResidentsTable
                      rows={filteredResidents}
                      hasOwnerRole={hasOwnerRole}
                      onOpenResident={openResident}
                      onOpenUnit={openUnit}
                      selected={visibleSelectedIds}
                      onToggle={toggleSelected}
                      onToggleAll={() =>
                        setSelection(
                          visibleSelection.length === filteredResidents.length
                            ? new Set()
                            : new Set(filteredResidents.map((r) => r.userId)),
                        )
                      }
                    />
                  </>
                )}
              </>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      {/* ─────────── Drawers ─────────── */}
      <DirectorySheet
        open={panelOpen}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title={
          panel?.kind === 'requests'
            ? 'Access requests'
            : panelUnit
              ? `Unit ${panelUnit.unitNumber}, ${panelUnit.locationLabel}`
              : panelResident?.displayName ?? 'Details'
        }
      >
        {panel?.kind === 'requests' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2.5 border-b border-edge bg-surface-subtle px-6 py-5 pr-14">
              <div className="text-xl font-semibold leading-tight">Access requests</div>
              {requestsQ.data?.length ? (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-interactive px-2 text-xs font-semibold text-content-inverse">
                  {requestsQ.data.length}
                </span>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
              <p className="text-sm text-content-secondary">
                People who asked to join from the signup page. Approving gives them portal access and links them to a unit.
              </p>
              <AccessRequestList communityId={communityId} layout="stacked" unitOptions={unitOptions} />
            </div>
          </div>
        ) : panelUnit ? (
          <UnitDetailPanel unit={panelUnit} inSheet {...unitPanelProps} />
        ) : panelResident ? (
          <ResidentDetailPanel
            resident={panelResident}
            hasOwnerRole={hasOwnerRole}
            onOpenUnit={openUnit}
            onSendInvite={sendInvite}
            inviting={invitingUserId === panelResident.userId}
            onEdit={() => setEditResidentId(panelResident.userId)}
            onRemove={() => askConfirm({ kind: 'remove-resident', userId: panelResident.userId })}
            onSendDocuments={
              canSendDocuments ? () => openSendDocs([panelResident.userId], panelResident.displayName) : undefined
            }
            inSheet
          />
        ) : null}
      </DirectorySheet>

      {/* ─────────── Dialogs ─────────── */}
      {balancesVisible ? (
        <PastDueRuleDialog
          open={ruleOpen}
          onOpenChange={setRuleOpen}
          communityId={communityId}
          rule={rule}
          delinquency={delinquencyQ.data ?? []}
          onSaved={() => {
            setRuleOpen(false);
            toast.success('Past-due rule saved.');
          }}
        />
      ) : null}
      {canWrite && unitForm.open ? (
        <UnitFormDialog
          key={unitForm.unitId ?? 'new'}
          open
          unit={unitForm.unitId === null ? null : (unitsQ.data ?? []).find((u) => u.id === unitForm.unitId) ?? null}
          onOpenChange={(open) => setUnitForm((prev) => ({ ...prev, open }))}
          communityId={communityId}
          hasOwnerRole={hasOwnerRole}
          showRent={!hasOwnerRole}
          onSaved={() => {
            toast.success(unitForm.unitId === null ? 'Unit added.' : 'Unit saved.');
            setUnitForm({ open: false, unitId: null });
          }}
        />
      ) : null}
      {editResident ? (
        <EditResidentDialog
          key={editResident.userId}
          open
          onOpenChange={(open) => {
            if (!open) setEditResidentId(null);
          }}
          communityId={communityId}
          resident={editResident}
          hasOwnerRole={hasOwnerRole}
          unitOptions={unitOptions}
          onSaved={(moved) => {
            toast.success(moved ? 'Resident moved.' : 'Resident saved.');
            setEditResidentId(null);
          }}
        />
      ) : null}
      {canSendDocuments && sendDocs ? (
        <SendDocumentsDialog
          key={sendDocs.nonce}
          open
          onOpenChange={(open) => {
            if (!open) setSendDocs(null);
          }}
          communityId={communityId}
          userIds={sendDocs.userIds}
          recipientLabel={sendDocs.label}
          onSent={(results) => {
            const { message, tone } = describeSendResults(results);
            (tone === 'warning' ? toast.warning : toast.success)(message);
            setSendDocs(null);
            setSelection(new Set());
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        restoreFocusTo={confirmReturnRef}
        {...confirmCopy}
        onConfirm={() => void runConfirm()}
      />
      {isAdmin ? (
        <AddResidentDialog
          open={addResident.open}
          onOpenChange={(open) => setAddResident((prev) => ({ ...prev, open }))}
          communityType={communityType}
          submitting={inviteResident.isPending}
          onSubmit={handleAddResident}
          error={inviteResident.error instanceof Error ? inviteResident.error.message : null}
          sendInvitation={sendInvitation}
          onSendInvitationChange={setSendInvitation}
          unitOptions={unitOptions}
          defaultUnitId={addResident.unitId}
        />
      ) : null}
    </div>
  );
}
