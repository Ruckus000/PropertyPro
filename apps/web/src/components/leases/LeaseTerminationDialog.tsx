'use client';

import { useState } from 'react';
import type { EnrichedLeaseListItem } from '@/hooks/use-leases';
import { useUpdateLease } from '@/hooks/use-leases';
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
import { Textarea } from '@/components/ui/textarea';

interface LeaseTerminationDialogProps {
  communityId: number;
  lease: EnrichedLeaseListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaseTerminationDialog({
  communityId,
  lease,
  open,
  onOpenChange,
}: LeaseTerminationDialogProps) {
  const updateLease = useUpdateLease(communityId);

  const [terminationDate, setTerminationDate] = useState('');
  const [terminationNotes, setTerminationNotes] = useState('');

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!lease) return;

    await updateLease.mutateAsync({
      id: lease.id,
      status: 'terminated',
      endDate: terminationDate || null,
      notes: terminationNotes.trim()
        ? `${lease.notes ? lease.notes + '\n' : ''}Terminated: ${terminationNotes.trim()}`
        : lease.notes,
    });

    setTerminationDate('');
    setTerminationNotes('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Terminate Lease</DialogTitle>
          <DialogDescription>
            This will terminate Lease #{lease?.id}. This action cannot be easily
            undone.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleConfirm} className="space-y-4">
          {updateLease.isError && (
            <AlertBanner
              status="danger"
              title="Failed to terminate lease. Please try again."
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="termination-date">Termination Date</Label>
            <Input
              id="termination-date"
              type="date"
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="termination-notes">Reason / Notes</Label>
            <Textarea
              id="termination-notes"
              placeholder="Reason for termination..."
              value={terminationNotes}
              onChange={(e) => setTerminationNotes(e.target.value)}
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
            <Button
              type="submit"
              variant="destructive"
              disabled={updateLease.isPending}
            >
              {updateLease.isPending ? 'Terminating...' : 'Terminate Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
