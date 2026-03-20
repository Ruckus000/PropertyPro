'use client';

import { useState } from 'react';
import { useCreateLease } from '@/hooks/use-leases';
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

  const [unitId, setUnitId] = useState('');
  const [residentName, setResidentName] = useState('');
  const [residentEmail, setResidentEmail] = useState('');
  const [residentId, setResidentId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setUnitId('');
    setResidentName('');
    setResidentEmail('');
    setResidentId('');
    setStartDate('');
    setEndDate('');
    setRentAmount('');
    setNotes('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedUnitId = Number(unitId);
    if (!Number.isInteger(parsedUnitId) || parsedUnitId <= 0) return;
    if (!residentId.trim()) return;
    if (!startDate) return;

    // Convert dollar amount to cents string for the API
    let rentCents: string | null = null;
    if (rentAmount.trim()) {
      const dollars = parseFloat(rentAmount);
      if (!Number.isNaN(dollars) && dollars > 0) {
        rentCents = String(Math.round(dollars * 100));
      }
    }

    await createLease.mutateAsync({
      unitId: parsedUnitId,
      residentId: residentId.trim(),
      startDate,
      endDate: endDate || null,
      rentAmount: rentCents,
      notes: notes.trim() || null,
    });

    resetForm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Lease</DialogTitle>
          <DialogDescription>
            Create a new lease record for a unit in this community.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lease-unit">Unit ID</Label>
            <Input
              id="lease-unit"
              type="number"
              min={1}
              placeholder="e.g. 101"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lease-resident-name">Resident Name</Label>
              <Input
                id="lease-resident-name"
                placeholder="Jane Smith"
                value={residentName}
                onChange={(e) => setResidentName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lease-resident-email">Resident Email</Label>
              <Input
                id="lease-resident-email"
                type="email"
                placeholder="jane@example.com"
                value={residentEmail}
                onChange={(e) => setResidentEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lease-resident-id">Resident User ID</Label>
            <Input
              id="lease-resident-id"
              placeholder="UUID of the resident user"
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              required
            />
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
