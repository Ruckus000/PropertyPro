'use client';

import { useState, useEffect } from 'react';
import type { EnrichedLeaseListItem } from '@/hooks/use-leases';
import { useCreateLease } from '@/hooks/use-leases';
import { parseRentInput, addOneDayUTC } from '@/lib/utils/lease-utils';
import { AlertBanner } from '@/components/shared/alert-banner';
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
  lease: EnrichedLeaseListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaseRenewalDialog({
  communityId,
  lease,
  open,
  onOpenChange,
}: LeaseRenewalDialogProps) {
  // Month-to-month leases (no end date) cannot be renewed
  if (lease !== null && !lease.endDate) return null;

  const createLease = useCreateLease(communityId);

  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newRentAmount, setNewRentAmount] = useState('');

  useEffect(() => {
    if (lease && open) {
      // New start = current end + 1 day (UTC-safe)
      if (lease.endDate) {
        setNewStartDate(addOneDayUTC(lease.endDate));
      }

      // Pre-populate current rent — raw decimal, no conversion
      setNewRentAmount(lease.rentAmount ?? '');
      setNewEndDate('');
    }
  }, [lease, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lease) return;

    const parsedRent = parseRentInput(newRentAmount);

    await createLease.mutateAsync({
      unitId: lease.unitId,
      residentId: lease.residentId,
      startDate: newStartDate,
      endDate: newEndDate || null,
      rentAmount: parsedRent,
      isRenewal: true,
      previousLeaseId: lease.id,
    });

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Renew Lease</DialogTitle>
          <DialogDescription>
            Create a renewal for Lease #{lease?.id}. The current lease will be
            marked as renewed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {createLease.isError && (
            <AlertBanner
              status="danger"
              title="Failed to renew lease. Please try again."
            />
          )}

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
