'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { usePackages, usePickupPackage, type PackageListItem } from '@/hooks/use-packages';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { getPackageColumns, type PackageColumnActions } from './package-columns';
import { PackageLogForm } from './PackageLogForm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const [pickedUpByName, setPickedUpByName] = useState('');

  const { data: packages, isLoading } = usePackages(communityId);
  const pickupMutation = usePickupPackage(communityId);

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
        setPickedUpByName('');
      },
    }),
    [],
  );

  const columns = useMemo(() => getPackageColumns(actions), [actions]);

  const handlePickup = useCallback(async () => {
    if (!pickupPkg || !pickedUpByName.trim()) return;
    await pickupMutation.mutateAsync({
      packageId: pickupPkg.id,
      pickedUpByName: pickedUpByName.trim(),
    });
    setPickupPkg(null);
    setPickedUpByName('');
  }, [pickupPkg, pickedUpByName, pickupMutation]);

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

      {/* Pickup confirmation dialog */}
      <Dialog
        open={pickupPkg !== null}
        onOpenChange={(open) => {
          if (!open) setPickupPkg(null);
        }}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Mark as Picked Up</DialogTitle>
            <DialogDescription>
              Confirm pickup for {pickupPkg?.recipientName}&apos;s{' '}
              {pickupPkg?.carrier} package.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="pickup-by">Picked Up By</Label>
            <Input
              id="pickup-by"
              placeholder="Name of person picking up"
              value={pickedUpByName}
              onChange={(e) => setPickedUpByName(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPickupPkg(null)}>
              Cancel
            </Button>
            <Button
              onClick={handlePickup}
              disabled={!pickedUpByName.trim() || pickupMutation.isPending}
            >
              {pickupMutation.isPending ? 'Confirming...' : 'Confirm Pickup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
