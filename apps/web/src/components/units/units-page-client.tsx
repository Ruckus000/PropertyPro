'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useUnits, useCreateUnit } from '@/hooks/use-units';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';

interface UnitsPageClientProps {
  communityId: number;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
}

export function UnitsPageClient({ communityId, communityType }: UnitsPageClientProps) {
  const { data: units, isLoading, error } = useUnits(communityId);
  const createUnit = useCreateUnit(communityId);
  const [open, setOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createUnit.mutateAsync({
      communityId,
      unitNumber,
      building: building || null,
      floor: floor ? Number.parseInt(floor, 10) : null,
    });
    setUnitNumber('');
    setBuilding('');
    setFloor('');
    setOpen(false);
  }

  const addUnitButton = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus size={16} aria-hidden="true" className="mr-1" />
          Add unit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a unit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="unitNumber">Unit number</Label>
            <Input
              id="unitNumber"
              required
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              placeholder="e.g. 101"
            />
          </div>
          <div>
            <Label htmlFor="building">Building (optional)</Label>
            <Input
              id="building"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="e.g. A"
            />
          </div>
          <div>
            <Label htmlFor="floor">Floor (optional)</Label>
            <Input
              id="floor"
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 1"
            />
          </div>
          {createUnit.error && (
            <p role="alert" className="text-sm text-status-danger">
              {createUnit.error.message}
            </p>
          )}
          {/* DialogFooter is not imported; use a plain flex row instead. */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUnit.isPending}>
              {createUnit.isPending ? 'Adding…' : 'Add unit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading units…</p>;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-status-danger/40 bg-status-danger/5 p-4 text-sm text-status-danger"
      >
        We couldn&apos;t load units. Please try again.
      </div>
    );
  }

  if (units && units.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-content">Units</h1>
        </div>
        <EmptyState
          icon="building"
          title="No units yet"
          description="Add your first unit to start managing residents, leases, and compliance."
          action={addUnitButton}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-content">Units</h1>
        {addUnitButton}
      </div>

      <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs font-semibold uppercase text-content-secondary">
            <tr>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Building</th>
              <th className="px-3 py-2">Floor</th>
              {communityType === 'apartment' && <th className="px-3 py-2">Rent</th>}
            </tr>
          </thead>
          <tbody>
            {units?.map((u) => (
              <tr key={u.id} className="border-t border-edge">
                <td className="px-3 py-2 font-medium text-content">{u.unitNumber}</td>
                <td className="px-3 py-2 text-content-secondary">{u.building ?? '—'}</td>
                <td className="px-3 py-2 text-content-secondary">{u.floor ?? '—'}</td>
                {communityType === 'apartment' && (
                  <td className="px-3 py-2 text-content-secondary">{u.rentAmount ?? '—'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
