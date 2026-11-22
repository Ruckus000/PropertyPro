'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { usePackages, type PackageListItem } from '@/hooks/use-packages';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { getPackageColumns, type PackageColumnActions } from './package-columns';
import { PackageLogForm } from './PackageLogForm';
import { Button } from '@/components/ui/button';
import { PackagePickupDialog } from './PackagePickupDialog';

interface PackageStaffViewProps {
  communityId: number;
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Picked Up', value: 'picked_up' },
];

export function PackageStaffView({ communityId }: PackageStaffViewProps) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [logOpen, setLogOpen] = useState(false);
  const [pickupPkg, setPickupPkg] = useState<PackageListItem | null>(null);

  const { data: packages, isLoading } = usePackages(communityId);

  const filteredPackages = useMemo(() => {
    if (!packages) return [];
    switch (activeFilter) {
      case 'pending':
        return packages.filter((p) => p.status !== 'picked_up');
      case 'picked_up':
        return packages.filter((p) => p.status === 'picked_up');
      default:
        return packages;
    }
  }, [packages, activeFilter]);

  const actions: PackageColumnActions = useMemo(
    () => ({
      onMarkPickedUp: (pkg) => {
        setPickupPkg(pkg);
      },
    }),
    [],
  );

  const columns = useMemo(() => getPackageColumns(actions), [actions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <QuickFilterTabs
          tabs={FILTER_TABS}
          active={activeFilter}
          onChange={setActiveFilter}
        />
        <Button onClick={() => setLogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Log Package
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filteredPackages}
        isLoading={isLoading}
        emptyMessage="No packages found."
        emptyAction={
          <Button variant="outline" size="sm" onClick={() => setLogOpen(true)}>
            Log first package
          </Button>
        }
      />

      <PackageLogForm
        communityId={communityId}
        open={logOpen}
        onOpenChange={setLogOpen}
      />

      <PackagePickupDialog
        communityId={communityId}
        pkg={pickupPkg}
        onClose={() => setPickupPkg(null)}
      />
    </div>
  );
}
