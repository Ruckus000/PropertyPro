'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import {
  useEnrichedLeases,
  type EnrichedLeaseListItem,
  type LeaseTableRow,
} from '@/hooks/use-leases';
import { isExpiringWithinWindow } from '@/lib/utils/lease-utils';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { AlertBanner } from '@/components/shared/alert-banner';
import { getLeaseColumns, type LeaseColumnActions } from './lease-columns';
import { LeaseCreateModal } from './LeaseCreateModal';
import { LeaseEditPanel } from './LeaseEditPanel';
import { LeaseRenewalDialog } from './LeaseRenewalDialog';
import { LeaseTerminationDialog } from './LeaseTerminationDialog';
import { Button } from '@/components/ui/button';

interface LeaseListPageProps {
  communityId: number;
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Expiring Soon', value: 'expiring_soon' },
  { label: 'Month-to-Month', value: 'month_to_month' },
  { label: 'Vacant Units', value: 'vacant' },
];

export function LeaseListPage({ communityId }: LeaseListPageProps) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editLease, setEditLease] = useState<EnrichedLeaseListItem | null>(null);
  const [renewLease, setRenewLease] = useState<EnrichedLeaseListItem | null>(null);
  const [terminateLease, setTerminateLease] = useState<EnrichedLeaseListItem | null>(null);

  const { leases, units, isLoading, isError, hasEnrichmentError } = useEnrichedLeases(communityId);

  // Pin "now" once per render so all filter/status comparisons use the same clock tick
  const referenceDate = useMemo(() => new Date(), []);

  const filteredRows = useMemo<LeaseTableRow[]>(() => {
    switch (activeFilter) {
      case 'expiring_soon':
        return leases
          .filter(
            (l) =>
              l.status !== 'terminated' &&
              l.status !== 'expired' &&
              isExpiringWithinWindow(l.endDate, 60, referenceDate),
          )
          .map((lease) => ({ kind: 'lease' as const, lease }));

      case 'month_to_month':
        return leases
          .filter((l) => !l.endDate && l.status === 'active')
          .map((lease) => ({ kind: 'lease' as const, lease }));

      case 'vacant': {
        // Vacancy = unit has no lease with status 'active'.
        // Units with expired/terminated/renewed leases are considered vacant.
        const activeUnitIds = new Set(
          leases
            .filter((l) => l.status === 'active')
            .map((l) => l.unitId),
        );
        return units
          .filter((u) => !activeUnitIds.has(u.id))
          .map((u) => ({ kind: 'vacant' as const, unitId: u.id, unitNumber: u.unitNumber }));
      }

      default:
        return leases.map((lease) => ({ kind: 'lease' as const, lease }));
    }
  }, [leases, units, activeFilter, referenceDate]);

  const actions: LeaseColumnActions = useMemo(
    () => ({
      onView: (lease) => setEditLease(lease),
      onEdit: (lease) => setEditLease(lease),
      onRenew: (lease) => setRenewLease(lease),
      onTerminate: (lease) => setTerminateLease(lease),
      onCreateLease: () => setCreateOpen(true),
    }),
    [],
  );

  const columns = useMemo(
    () => getLeaseColumns(actions, referenceDate),
    [actions, referenceDate],
  );

  const handleRenewalClose = useCallback((open: boolean) => {
    if (!open) setRenewLease(null);
  }, []);

  const handleTerminationClose = useCallback((open: boolean) => {
    if (!open) setTerminateLease(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <QuickFilterTabs
          tabs={FILTER_TABS}
          active={activeFilter}
          onChange={setActiveFilter}
        />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New Lease
        </Button>
      </div>

      {isError && (
        <AlertBanner
          status="danger"
          title="We couldn't load leases."
          description="Please refresh the page or try again."
        />
      )}
      {hasEnrichmentError && !isError && (
        <AlertBanner
          status="warning"
          title="Some lease details are unavailable."
          description="Unit numbers or resident names may be missing. Lease data is still complete."
        />
      )}

      <DataTable
        columns={columns}
        data={filteredRows}
        isLoading={isLoading}
        emptyMessage="No leases found."
        emptyAction={
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            Create first lease
          </Button>
        }
      />

      <LeaseCreateModal
        communityId={communityId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <LeaseEditPanel
        communityId={communityId}
        lease={editLease}
        onClose={() => setEditLease(null)}
      />

      <LeaseRenewalDialog
        communityId={communityId}
        lease={renewLease}
        open={renewLease !== null}
        onOpenChange={handleRenewalClose}
      />

      <LeaseTerminationDialog
        communityId={communityId}
        lease={terminateLease}
        open={terminateLease !== null}
        onOpenChange={handleTerminationClose}
      />
    </div>
  );
}
