'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useLeases, type LeaseListItem } from '@/hooks/use-leases';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { getLeaseColumns, type LeaseColumnActions } from './lease-columns';
import { LeaseCreateModal } from './LeaseCreateModal';
import { LeaseEditPanel } from './LeaseEditPanel';
import { LeaseRenewalDialog } from './LeaseRenewalDialog';
import { LeaseTerminationDialog } from './LeaseTerminationDialog';
import { Button } from '@/components/ui/button';
import { differenceInCalendarDays, parseISO } from 'date-fns';

interface LeaseListPageProps {
  communityId: number;
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Expiring Soon', value: 'expiring_soon' },
  { label: 'Month-to-Month', value: 'month_to_month' },
];

export function LeaseListPage({ communityId }: LeaseListPageProps) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editLease, setEditLease] = useState<LeaseListItem | null>(null);
  const [renewLease, setRenewLease] = useState<LeaseListItem | null>(null);
  const [terminateLease, setTerminateLease] = useState<LeaseListItem | null>(null);

  const { data: leases, isLoading } = useLeases(communityId);

  const filteredLeases = useMemo(() => {
    if (!leases) return [];
    switch (activeFilter) {
      case 'expiring_soon':
        return leases.filter((l) => {
          if (!l.endDate || l.status === 'terminated' || l.status === 'expired') return false;
          const days = differenceInCalendarDays(parseISO(l.endDate), new Date());
          return days >= 0 && days <= 60;
        });
      case 'month_to_month':
        return leases.filter(
          (l) => !l.endDate && l.status === 'active',
        );
      default:
        return leases;
    }
  }, [leases, activeFilter]);

  const actions: LeaseColumnActions = useMemo(
    () => ({
      onView: (lease) => setEditLease(lease),
      onEdit: (lease) => setEditLease(lease),
      onRenew: (lease) => setRenewLease(lease),
      onTerminate: (lease) => setTerminateLease(lease),
    }),
    [],
  );

  const columns = useMemo(() => getLeaseColumns(actions), [actions]);

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
          <Plus className="mr-2 h-4 w-4" />
          New Lease
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filteredLeases}
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
