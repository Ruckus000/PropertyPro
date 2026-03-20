'use client';

import { useState, useEffect } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import type { LeaseListItem } from '@/hooks/use-leases';
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

interface LeaseRenewalDialogProps {
  communityId: number;
  lease: LeaseListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaseRenewalDialog({
  communityId,
  lease,
  open,
  onOpenChange,
}: LeaseRenewalDialogProps) {
  const createLease = useCreateLease(communityId);

  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newRentAmount, setNewRentAmount] = useState('');

  useEffect(() => {
    if (lease && open) {
      // New start = current end + 1 day (or today if month-to-month)
      if (lease.endDate) {
        const nextDay = addDays(parseISO(lease.endDate), 1);
        setNewStartDate(format(nextDay, 'yyyy-MM-dd'));
      } else {
        setNewStartDate(format(new Date(), 'yyyy-MM-dd'));
      }

      // Pre-populate current rent (convert cents to dollars)
      if (lease.rentAmount) {
        const dollars = Number(lease.rentAmount) / 100;
        setNewRentAmount(Number.isNaN(dollars) ? '' : String(dollars));
      } else {
        setNewRentAmount('');
      }

      setNewEndDate('');
    }
  }, [lease, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lease) return;

    let rentCents: string | null = null;
    if (newRentAmount.trim()) {
      const dollars = parseFloat(newRentAmount);
      if (!Number.isNaN(dollars) && dollars > 0) {
        rentCents = String(Math.round(dollars * 100));
      }
    }

    await createLease.mutateAsync({
      unitId: lease.unitId,
      residentId: lease.residentId,
      startDate: newStartDate,
      endDate: newEndDate || null,
      rentAmount: rentCents,
      isRenewal: true,
      previousLeaseId: lease.id,
    });

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Renew Lease</DialogTitle>
          <DialogDescription>
            Create a renewal for Lease #{lease?.id}. The current lease will be
            marked as renewed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="renewal-start">New Start Date</Label>
            <Input
              id="renewal-start"
              type="date"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="renewal-end">
              New End Date{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="renewal-end"
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for month-to-month
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="renewal-rent">Monthly Rent ($)</Label>
            <Input
              id="renewal-rent"
              type="number"
              min={0}
              step={0.01}
              placeholder="1500.00"
              value={newRentAmount}
              onChange={(e) => setNewRentAmount(e.target.value)}
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
              {createLease.isPending ? 'Renewing...' : 'Renew Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
