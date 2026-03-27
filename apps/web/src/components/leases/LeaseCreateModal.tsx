'use client';

import { useState } from 'react';
import { useCreateLease, useUnits } from '@/hooks/use-leases';
import { parseRentInput } from '@/lib/utils/lease-utils';
import { AlertBanner } from '@/components/shared/alert-banner';
import { ResidentSearchCombobox } from '@/components/shared/ResidentSearchCombobox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface LeaseCreateModalProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaseCreateModal({
  communityId,
  open,
  onOpenChange,
}: LeaseCreateModalProps) {
  const createLease = useCreateLease(communityId);
  const { data: units = [] } = useUnits(communityId);

  const [unitId, setUnitId] = useState('');
  const [residentId, setResidentId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setUnitId('');
    setResidentId(null);
    setStartDate('');
    setEndDate('');
    setRentAmount('');
    setNotes('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedUnitId = Number(unitId);
    if (!Number.isInteger(parsedUnitId) || parsedUnitId <= 0) return;
    if (!residentId) return;
    if (!startDate) return;

    const parsedRent = parseRentInput(rentAmount);

    await createLease.mutateAsync({
      unitId: parsedUnitId,
      residentId,
      startDate,
      endDate: endDate || null,
      rentAmount: parsedRent,
      notes: notes.trim() || null,
    });

    resetForm();
    onOpenChange(false);
  }

  // Sort units by unitNumber with numeric locale compare
  const sortedUnits = [...units].sort((a, b) =>
    a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New Lease</DialogTitle>
          <DialogDescription>
            Create a new lease record for a unit in this community.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {createLease.isError && (
            <AlertBanner
              status="danger"
              title="Failed to create lease. Please try again."
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="lease-unit">Unit</Label>
            <Select value={unitId} onValueChange={setUnitId} required>
              <SelectTrigger id="lease-unit">
                <SelectValue placeholder="Select a unit" />
              </SelectTrigger>
              <SelectContent>
                {sortedUnits.map((unit) => (
                  <SelectItem key={unit.id} value={String(unit.id)}>
                    {unit.unitNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Resident</Label>
            <ResidentSearchCombobox
              communityId={communityId}
              value={residentId}
              onChange={(id) => setResidentId(id)}
            />
            <p className="text-xs text-muted-foreground">
              Resident not listed?{' '}
              <a
                href={`/dashboard/residents?communityId=${communityId}`}
                className="underline hover:no-underline"
              >
                Add them first
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lease-start">Start Date</Label>
              <Input
                id="lease-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lease-end">
                End Date <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="lease-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for month-to-month
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lease-rent">
              Monthly Rent ($) <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="lease-rent"
              type="number"
              min={0}
              step={0.01}
              placeholder="1500.00"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lease-notes">Notes</Label>
            <Textarea
              id="lease-notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLease.isPending}>
              {createLease.isPending ? 'Creating...' : 'Create Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
