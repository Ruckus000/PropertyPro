'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DollarSign, Download, MoreHorizontal, Plus, Upload, Users } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section } from '@propertypro/ui/components/shared/section';
import type { CommunityType } from '@propertypro/shared';
import { PageHeader } from '@/components/shared/page-header';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminReviewList } from '@/components/join-requests/admin-review-list';
import { useAdminJoinRequests } from '@/hooks/use-admin-join-requests';
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
import { useDirectoryExport, type DirectoryExportInput } from '@/hooks/use-directory-export';
import { occupantIdOf, occupantToResident, useCreateOccupant, useOccupants, useRemoveOccupant } from '@/hooks/use-occupants';
import { ConfirmDialog } from '@/components/pm/site-editor-v3/ConfirmDialog';
import { AddResidentDialog } from '@/components/residents/add-resident-dialog';
// Direct path, not the barrel: the barrel also re-exports SetupGuide, which
// this page loads only on demand.
import { ContinueSetupBar, useSetupDismissed } from '@/components/shared/setup-guide/continue-setup-bar';
import dynamic from 'next/dynamic';
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
  canBeInvited,
  isHouseholdMember,
  buildingLabelOf,
  computeOverview,
  describeRule,
  describeSendResults,
  withLimitReason,
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
import type { DirectoryTab } from '@/lib/directory/directory-href';
import { TOP_NAV_ENABLED } from '@/components/layout/top-nav-flag';

// Rendered only on an empty directory or from "Continue setup".
const DirectorySetup = dynamic(() => import('./directory-setup').then((m) => m.DirectorySetup), {
  loading: () => <div className="min-h-96 animate-pulse rounded-md bg-surface-muted" aria-hidden="true" />,
});

// ponytail: this route sits ~21 KiB under the 1160 KiB hard per-route budget
// (1138.7 KiB on a local production build, 2026-11-24, after the move onto
// PageLayout added 4.6 KiB; enforced on this unbudgeted route since 2026-10-12). Lazy-loading the dialogs below via
// next/dynamic was measured and made things WORSE: it reshuffled shared chunks
// and pushed the web aggregate budget (1435 KiB now, routes this page is not
// even in) over. Re-measure both numbers before adding weight here.

export type { DirectoryTab };

const ADMIN_TABS: readonly DirectoryTab[] = ['units', 'residents', 'requests'];

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

type Panel = { kind: 'unit'; id: number } | { kind: 'resident'; id: string } | null;

type Confirm =
  | { kind: 'delete-unit'; unitId: number }
  | { kind: 'remove-resident'; userId: string }
  | { kind: 'bulk-invite'; userIds: string[]; skippedActive: number; skippedHousehold: number }
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

// Ink, not coral: the selected tab is marked by an underline (design §11.3).
// Same overrides as the Visitors page: every one has the primitive's variant
// (none, or data-[state=active]) so tailwind-merge replaces rather than stacks.
const TAB_LIST_CLASS =
  'flex w-full justify-start gap-1 rounded-none border-b border-edge-strong bg-transparent p-0';
const TAB_TRIGGER_CLASS =
  'gap-2 rounded-none border-b-2 border-transparent py-2 data-[state=active]:border-content data-[state=active]:bg-transparent data-[state=active]:shadow-none';

// The page's "no results" state (spec §5.7): the toolbar stays, the section
// says nothing matches and offers the way back.
function NoMatches({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <Section>
      <div className="flex flex-col items-start gap-3 px-4 py-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-content">No {noun} match</p>
          <p className="text-sm text-content-secondary">Try a different search or filter.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </Section>
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const wide = useIsDesktop();

  const rawTab = searchParams.get('tab');
  const tab: DirectoryTab = !isAdmin
    ? 'units'
    : (ADMIN_TABS as readonly string[]).includes(rawTab ?? '')
      ? (rawTab as DirectoryTab)
      : initialTab;

  /* ── UI state ── */
  // `?q=` (command palette, search results) seeds the search of the tab it opens.
  const [unitQuery, setUnitQuery] = useState(() => (tab === 'units' ? searchParams.get('q') ?? '' : ''));
  const [residentQuery, setResidentQuery] = useState(() => (tab === 'residents' ? searchParams.get('q') ?? '' : ''));
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
  const [setupOpen, setSetupOpen] = useState(false);
  const setupDismissal = useSetupDismissed('directory', communityId);
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
      params.set('tab', (ADMIN_TABS as readonly string[]).includes(next) ? next : 'units');
      params.delete('q');
      setSelection(new Set());
      // `replace`, not `push`: Back should leave the page, not walk the tabs.
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [pathname, searchParams],
  );

  /* ── Data ── */
  const unitsQ = useUnits(communityId);
  const residentsQ = useResidentsList(communityId, { enabled: isAdmin });
  const occupantsQ = useOccupants(communityId, { enabled: isAdmin });
  const delinquencyQ = useDelinquency(communityId, { enabled: canSeeBalances });
  const ruleQ = usePastDueRule(communityId, { enabled: canSeeBalances });
  // People who already have an account ask through "Join another community".
  // The Requests tab is where they are reviewed; a separate page nothing linked
  // to left them unseen (onboarding audit F5).
  const joinRequestsQ = useAdminJoinRequests({ communityId, enabled: isAdmin });
  const pendingRequests = joinRequestsQ.data?.length ?? 0;
  const exporter = useDirectoryExport(communityId);
  const runExport = useCallback(
    (input: DirectoryExportInput) =>
      exporter.mutate(input, {
        onSuccess: ({ rowCount }) => toast.success(`Exported ${plural(rowCount, input.kind === 'units' ? 'unit' : 'resident')}.`),
        onError: (error) => toast.error(error.message || 'Export failed.'),
      }),
    [exporter],
  );

  // A refused or failed delinquency read hides finance UI rather than showing
  // every unit as "nothing overdue".
  // Without the rule we cannot say what "past due" means here, so the same
  // hide-on-failure applies to it.
  const balancesVisible = canSeeBalances && delinquencyQ.isSuccess && ruleQ.isSuccess;
  const rule = ruleQ.data ?? ANY_OVERDUE_RULE;
  // Members with a login, plus household members (no login) folded in as
  // `no_login` rows — one list, so every count and consistency check sees both.
  const residents = useMemo(
    () =>
      isAdmin && residentsQ.data
        ? [...residentsQ.data, ...(occupantsQ.data ?? []).map(occupantToResident)]
        : null,
    [isAdmin, residentsQ.data, occupantsQ.data],
  );

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
  const createOccupant = useCreateOccupant(communityId);
  const handleAddResident = useCallback(
    async (values: ResidentFormSubmitValues) => {
      setInviteWarning(null);
      if (values.household) {
        if (values.unitId === null) return; // The form requires a unit.
        try {
          await createOccupant.mutateAsync({
            unitId: values.unitId,
            fullName: values.fullName,
            email: values.email.trim() || null,
            phone: values.phone.trim() || null,
            isOwnerHousehold: values.isUnitOwner,
          });
        } catch {
          return; // Shown in the dialog via createOccupant.error.
        }
        toast.success('Household member added.');
        setAddResident({ open: false, unitId: null });
        return;
      }
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
    [inviteResident, createOccupant, sendInvitation, queryClient, communityId],
  );

  const openAddResident = useCallback((unitId: number | null) => {
    inviteResident.reset();
    createOccupant.reset();
    setAddResident({ open: true, unitId });
  }, [inviteResident, createOccupant]);

  // Documents go to people who can sign in to open them: household members are
  // dropped here, the one place every send starts from.
  const openSendDocs = useCallback((userIds: string[], label: string) => {
    const members = userIds.filter((id) => occupantIdOf(id) === null);
    if (members.length === 0) {
      toast.info('Household members have no portal login, so documents can’t be sent to them.');
      return;
    }
    setSendDocs({ userIds: members, label: members.length === userIds.length ? label : plural(members.length, 'resident'), nonce: Date.now() });
  }, []);

  const openUnit = useCallback((id: number) => setPanel({ kind: 'unit', id }), []);
  const openResident = useCallback((id: string) => setPanel({ kind: 'resident', id }), []);

  const askConfirm = useCallback((next: NonNullable<Confirm>) => {
    confirmReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirm(next);
  }, []);

  const deleteUnit = useDeleteUnit(communityId);
  const removeResident = useRemoveResident(communityId);
  const removeOccupant = useRemoveOccupant(communityId);
  const batchInvite = useBatchInvite(communityId);

  const runConfirm = useCallback(async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'delete-unit') {
        await deleteUnit.mutateAsync(confirm.unitId);
        setPanel(null);
        toast.success('Unit deleted.');
      } else if (confirm.kind === 'remove-resident') {
        const target = residentRows.find((x) => x.userId === confirm.userId);
        if (target?.occupantId !== undefined) await removeOccupant.mutateAsync({ id: target.occupantId });
        else await removeResident.mutateAsync(confirm.userId);
        setPanel((p) => (p?.kind === 'resident' ? null : p));
        toast.success(target?.occupantId !== undefined ? 'Household member removed.' : 'Resident removed.');
      } else {
        const results = await batchInvite.mutateAsync(confirm.userIds);
        const sent = results.filter((r) => r.status === 'sent').length;
        const failed = results.length - sent;
        const parts = [`${plural(sent, 'invitation')} sent`];
        if (failed) parts.push(`${failed} failed`);
        if (confirm.skippedActive) parts.push(`${confirm.skippedActive} skipped (already active)`);
        if (confirm.skippedHousehold) parts.push(`${confirm.skippedHousehold} skipped (no portal login)`);
        const summary = failed
          ? `${parts.join(', ')}. The ${failed} not sent stay selected so you can retry.`
          : `${parts.join(', ')}.`;
        (failed ? toast.warning : toast.success)(withLimitReason(summary, results));
        // Keep the people not sent selected: past the 100-per-minute email
        // budget a later chunk is refused, and clearing the selection lost
        // track of exactly who still needs an invitation (audit F4).
        setSelection(new Set(results.filter((r) => r.status !== 'sent').map((r) => r.userId)));
      }
    } catch (err) {
      // The server's message says why (e.g. "its ledger balance is not zero").
      toast.error(err instanceof Error ? err.message : 'That did not work. Please try again.');
    }
  }, [confirm, deleteUnit, removeResident, removeOccupant, batchInvite, residentRows]);

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
  const panelOpen = panelUnit !== null || panelResident !== null;

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
    // The API sends counts (not null) only to managers with violations on.
    canSeeViolations: (unitsQ.data ?? []).some((u) => u.openViolations != null),
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
      if (r && isHouseholdMember(r)) {
        return {
          title: `Remove ${r.displayName}?`,
          description: `They are taken off Unit ${r.unit?.unitNumber ?? ''}'s household and their details are permanently deleted. They have no portal access to lose.`,
          confirmLabel: 'Remove household member',
          destructive: true,
        };
      }
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
        }${
          confirm.skippedHousehold
            ? ` ${plural(confirm.skippedHousehold, 'household member')} with no portal login will be skipped.`
            : ''
        }`,
        confirmLabel: 'Send invitations',
        destructive: false,
      };
    }
    return { title: '', description: '', confirmLabel: 'Confirm', destructive: false };
  })();

  /* ── Render ── */
  const unitsLoading = unitsQ.isLoading;
  const residentsLoading = isAdmin && (residentsQ.isLoading || occupantsQ.isLoading);
  const primaryLabel = tab === 'units' ? 'Add unit' : 'Add resident';
  const showPrimary =
    tab === 'units' ? canWrite && (unitsQ.data?.length ?? 0) > 0 : tab === 'residents' ? residentRows.length > 0 : false;

  // ── Empty states (docs/design-system/patterns/empty-states.md §4.1, §4.3) ──
  // Setup: a manager with no units. Partial: units exist, residents or
  // invitations do not, until done or dismissed.
  const loaded = !unitsLoading && !residentsLoading && !unitsQ.isError;
  const setupAllowed = isAdmin && canWrite;
  const inSetup = setupAllowed && loaded && dirUnits.length === 0;
  // Invitations are done once everyone with a login has been invited; whether
  // they accept is theirs (the review list still shows who is not active).
  const notInvitedCount = residentRows.filter((r) => r.portalStatus === 'not_invited').length;
  const nextSetupStep =
    dirUnits.length === 0 ? 'Units' : residentRows.length === 0 ? 'Residents' : notInvitedCount > 0 ? 'Invitations' : null;
  const setupDone = [dirUnits.length > 0, residentRows.length > 0, residentRows.length > 0 && notInvitedCount === 0].filter(
    Boolean,
  ).length;
  // A residents load error is not "no residents": the tab's own banner says so.
  const showContinueBar =
    setupAllowed && loaded && !residentsQ.isError && !inSetup && nextSetupStep !== null && !setupOpen && !setupDismissal.dismissed;

  // When the guide closes (the first unit saved, "Review who to invite",
  // Close setup), the control that had focus unmounts with it: hand focus to
  // the selected tab so keyboard and screen-reader users keep their place.
  const guideShown = inSetup || (setupOpen && setupAllowed && loaded);
  const guideWasShown = useRef(guideShown);
  useEffect(() => {
    if (guideWasShown.current && !guideShown) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[role="tablist"] [role="tab"][aria-selected="true"]')?.focus();
      });
    }
    guideWasShown.current = guideShown;
  }, [guideShown]);

  // Header actions: "More actions" (outline) beside the tab's Add button (the
  // page's one filled primary). The setup guide carries its own actions, and
  // the Join requests tab has none.
  const moreActions =
    tab === 'residents' || tab === 'units' ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {tab === 'residents' ? (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/import-residents?communityId=${communityId}`}>
                <Upload size={16} className="mr-2 text-content-tertiary" aria-hidden="true" />
                Import from CSV
              </Link>
            </DropdownMenuItem>
          ) : tab === 'units' && canWrite ? (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/import-units?communityId=${communityId}`}>
                <Upload size={16} className="mr-2 text-content-tertiary" aria-hidden="true" />
                Import from CSV
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={exporter.isPending}
            onSelect={() => runExport({ kind: tab === 'residents' ? 'residents' : 'units' })}
          >
            <Download size={16} className="mr-2 text-content-tertiary" aria-hidden="true" />
            {tab === 'residents' ? 'Export residents (CSV)' : 'Export units (CSV)'}
          </DropdownMenuItem>
          {tab === 'units' && balancesVisible ? (
            <DropdownMenuItem onSelect={() => setRuleOpen(true)}>
              <DollarSign size={16} className="mr-2 text-content-tertiary" aria-hidden="true" />
              Past-due rule
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;
  const addButton = showPrimary ? (
    <Button
      type="button"
      onClick={() => (tab === 'units' ? setUnitForm({ open: true, unitId: null }) : openAddResident(null))}
    >
      <Plus aria-hidden="true" />
      {primaryLabel}
    </Button>
  ) : null;
  const headerActions =
    inSetup || (moreActions === null && addButton === null) ? undefined : (
      <>
        {moreActions}
        {addButton}
      </>
    );

  return (
    <>
      <Tabs value={tab} onValueChange={setTab}>
        <PageLayout
          template="list"
          banner={
            showContinueBar ? (
              <ContinueSetupBar
                done={setupDone}
                total={3}
                countLabel="setup steps done"
                next={nextSetupStep ?? undefined}
                onContinue={() => setSetupOpen(true)}
                onDismiss={setupDismissal.dismiss}
              />
            ) : undefined
          }
          header={
            <PageHeader
              title="Directory"
              icon={<Users />}
              // A non-admin sees units only, so the sentence promises no more.
              description={
                isAdmin
                  ? 'The units in this community and the people who live in them.'
                  : 'The units in this community.'
              }
              actions={headerActions}
            />
          }
          // No side panel and no generated "About": describeAccess reads the
          // permission matrix, where a resident may read `residents`, but this
          // page shows residents to admins only. The sentence would promise more
          // than the page gives.
          tabs={
            isAdmin && !inSetup ? (
              <TabsList aria-label="Directory sections" className={TAB_LIST_CLASS}>
                <TabsTrigger value="units" className={TAB_TRIGGER_CLASS}>
                  Units
                  <span className="text-xs font-medium text-content-tertiary">{dirUnits.length}</span>
                </TabsTrigger>
                <TabsTrigger value="residents" className={TAB_TRIGGER_CLASS}>
                  Residents
                  <span className="text-xs font-medium text-content-tertiary">{residentRows.length}</span>
                </TabsTrigger>
                <TabsTrigger value="requests" className={TAB_TRIGGER_CLASS}>
                  Join requests
                  {pendingRequests > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-interactive px-1.5 text-xs font-semibold text-content-inverse">
                      {pendingRequests}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            {guideShown ? (
              <DirectorySetup
                communityId={communityId}
                communityType={communityType}
                unitCount={dirUnits.length}
                residentCount={residentRows.length}
                notInvitedCount={notInvitedCount}
                onAddUnit={() => setUnitForm({ open: true, unitId: null })}
                onAddResident={() => openAddResident(null)}
                onReviewInvites={() => {
                  setSetupOpen(false);
                  setTab('residents');
                  setResidentStatus('not_active');
                }}
                {...(inSetup ? {} : { onClose: () => setSetupOpen(false) })}
              />
            ) : null}

            {/* The strip counts units: on an empty community it would only show zeros (F-4). */}
            {isAdmin && loaded && dirUnits.length > 0 ? (
              <OverviewStrip
                stats={stats}
                requestCount={joinRequestsQ.data ? pendingRequests : null}
                canSeeBalances={balancesVisible}
                unsetLabel={communityType === 'apartment' ? 'offline' : 'not set'}
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
                onRequests={() => setTab('requests')}
              />
            ) : null}

            {inSetup ? null : (
              <>
                {inviteWarning ? (
                  <AlertBanner
                    status="warning"
                    title="Invitation not sent"
                    description={`${inviteWarning.name} was added, but the invitation email failed to send.`}
                    actionPlacement="below"
                    action={
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void sendInvite(inviteWarning.userId)}
                          disabled={invitingUserId === inviteWarning.userId}
                        >
                          Resend invite
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setInviteWarning(null)}>
                          Dismiss
                        </Button>
                      </div>
                    }
                  />
                ) : null}

            {/* ─────────── Units ─────────── */}
            <TabsContent value="units" className="mt-0 flex flex-col gap-4 data-[state=inactive]:hidden">
              {unitsLoading || residentsLoading ? (
                <ListSkeleton />
              ) : unitsQ.isError ? (
                <AlertBanner
                  status="danger"
                  title="We couldn't load units"
                  description="An unexpected error occurred. Please try again."
                  action={
                    <Button
                      type="button"
                      onClick={() => void unitsQ.refetch()}
                    >
                      Retry
                    </Button>
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
                      <Button
                        type="button"
                        onClick={() => setUnitForm({ open: true, unitId: null })}
                      >
                        <Plus aria-hidden="true" />
                        Add unit
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  {isAdmin && (residentsQ.isError || occupantsQ.isError) ? (
                    <AlertBanner
                      status="warning"
                      title="Residents didn't load"
                      description="Units are shown without who lives in them."
                      action={
                        <Button
                          type="button"
                          onClick={() => {
                          void residentsQ.refetch();
                          void occupantsQ.refetch();
                        }}
                          variant="outline"
                        >
                          Retry
                        </Button>
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
                          <Button
                            type="button"
                            onClick={() => setRuleOpen(true)}
                            variant="link"
                            className="h-auto p-0 text-xs font-semibold text-content-link md:h-auto"
                          >
                            Change rule
                          </Button>
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
                    // ponytail: the split pane is sized from the viewport, so the tab row's extra height must come off it: always below lg (phones navigate with the tabs), and at lg+ only with the top-nav flag. Trigger: the top-nav flag is removed.
                    // ponytail: 22.5rem / 25.5rem are the old 16rem / 19rem plus 6.5rem for the painted page header. Worked out from the class heights (title row 2.8, gap 0.75, description 1.25, padding 1, two 1.25 layout gaps and the 2.6 underline tab row come to 11; the old action row and its gaps were 4.5), not measured in a browser. Trigger: a screenshot at 1280 or 1440 shows the pane ending short of, or past, the bottom of the window.
                    <div className={`grid ${TOP_NAV_ENABLED ? 'h-[calc(100dvh-25.5rem)]' : 'h-[calc(100dvh-25.5rem)] lg:h-[calc(100dvh-22.5rem)]'} min-h-[28rem] grid-cols-[300px_minmax(0,1fr)] gap-4 xl:grid-cols-[380px_minmax(0,1fr)]`}>
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
              <TabsContent value="residents" className="mt-0 flex flex-col gap-4 data-[state=inactive]:hidden">
                {residentsLoading ? (
                  <ListSkeleton />
                ) : (residentsQ.isError || occupantsQ.isError) ? (
                  <AlertBanner
                    status="danger"
                    title="We couldn't load residents"
                    description="An unexpected error occurred. Please try again."
                    action={
                      <Button
                        type="button"
                        onClick={() => {
                          void residentsQ.refetch();
                          void occupantsQ.refetch();
                        }}
                      >
                        Retry
                      </Button>
                    }
                  />
                ) : residentRows.length === 0 ? (
                  <EmptyState
                    preset="no_residents"
                    action={
                      <div className="flex flex-col items-center gap-2 sm:flex-row">
                        <Button
                          type="button"
                          onClick={() => openAddResident(null)}
                        >
                          <Plus aria-hidden="true" />
                          Add resident
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href={`/dashboard/import-residents?communityId=${communityId}`}>
                            <Upload aria-hidden="true" />
                            Import CSV
                          </Link>
                        </Button>
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
                            <Button
                              type="button"
                              onClick={() => {
                                const toInvite = visibleSelection.filter(canBeInvited);
                                const household = visibleSelection.filter(isHouseholdMember).length;
                                if (toInvite.length === 0) {
                                  toast.info(
                                    household === visibleSelection.length
                                      ? 'Household members have no portal login, so there is no invitation to send.'
                                      : 'Everyone selected has already signed in.',
                                  );
                                  return;
                                }
                                askConfirm({
                                  kind: 'bulk-invite',
                                  userIds: toInvite.map((r) => r.userId),
                                  skippedActive: visibleSelection.length - toInvite.length - household,
                                  skippedHousehold: household,
                                });
                              }}
                              variant="outline"
                              size="sm"
                            >
                              Resend invites
                            </Button>
                            {canSendDocuments ? (
                              <Button
                                type="button"
                                onClick={() =>
                                  openSendDocs(
                                    visibleSelection.map((r) => r.userId),
                                    visibleSelection.length === 1
                                      ? visibleSelection[0]!.displayName
                                      : plural(visibleSelection.length, 'resident'),
                                  )
                                }
                                variant="outline"
                                size="sm"
                              >
                                Send documents
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              onClick={() =>
                                runExport({
                                  kind: 'residents',
                                  userIds: visibleSelection.filter((r) => !isHouseholdMember(r)).map((r) => r.userId),
                                  occupantIds: visibleSelection.flatMap((r) => (r.occupantId !== undefined ? [r.occupantId] : [])),
                                })
                              }
                              disabled={exporter.isPending}
                              variant="outline"
                              size="sm"
                            >
                              <Download aria-hidden="true" />
                              Export CSV
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setSelection(new Set())}
                              variant="ghost"
                              size="sm"
                              className="ml-auto text-content-secondary"
                            >
                              Clear
                            </Button>
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

            {/* ─────────── Join requests (admins only) ─────────── */}
            {isAdmin ? (
              <TabsContent value="requests" className="mt-0 flex flex-col gap-4 data-[state=inactive]:hidden">
                <p className="text-sm text-content-secondary">
                  People with a PropertyPro account who asked to join this community. Approving gives them portal access; a denied person must wait 30 days to ask again.
                </p>
                <AdminReviewList communityId={communityId} />
              </TabsContent>
            ) : null}
              </>
            )}
          </div>
        </PageLayout>
      </Tabs>


      {/* ─────────── Drawers ─────────── */}
      <DirectorySheet
        open={panelOpen}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title={panelUnit ? `Unit ${panelUnit.unitNumber}, ${panelUnit.locationLabel}` : panelResident?.displayName ?? 'Details'}
      >
        {panelUnit ? (
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
              canSendDocuments && !isHouseholdMember(panelResident)
                ? () => openSendDocs([panelResident.userId], panelResident.displayName)
                : undefined
            }
            inSheet
          />
        ) : null}
      </DirectorySheet>

      {/* ─────────── Dialogs ─────────── */}
      {/* Mounted only while open, so every opening starts from the saved rule. */}
      {balancesVisible && ruleOpen ? (
        <PastDueRuleDialog
          open
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
          occupancyFromLeases={communityType === 'apartment'}
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
          submitting={inviteResident.isPending || createOccupant.isPending}
          onSubmit={handleAddResident}
          error={(inviteResident.error ?? createOccupant.error)?.message ?? null}
          allowHousehold
          sendInvitation={sendInvitation}
          onSendInvitationChange={setSendInvitation}
          unitOptions={unitOptions}
          defaultUnitId={addResident.unitId}
        />
      ) : null}
    </>
  );
}
