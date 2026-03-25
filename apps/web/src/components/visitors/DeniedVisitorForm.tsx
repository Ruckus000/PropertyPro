'use client';

import { useEffect, useState } from 'react';
import {
  useCreateDeniedVisitor,
  useUpdateDeniedVisitor,
  type DeniedVisitorListItem,
} from '@/hooks/use-denied-visitors';
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

interface DeniedVisitorFormProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: DeniedVisitorListItem | null;
}

export function DeniedVisitorForm({
  communityId,
  open,
  onOpenChange,
  editing,
}: DeniedVisitorFormProps) {
  const createDeniedVisitor = useCreateDeniedVisitor(communityId);
  const updateDeniedVisitor = useUpdateDeniedVisitor(communityId);

  const [fullName, setFullName] = useState('');
  const [reason, setReason] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;

    setFullName(editing?.fullName ?? '');
    setReason(editing?.reason ?? '');
    setVehiclePlate(editing?.vehiclePlate ?? '');
    setNotes(editing?.notes ?? '');
  }, [editing, open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fullName.trim() || !reason.trim()) return;

    if (editing) {
      await updateDeniedVisitor.mutateAsync({
        deniedId: editing.id,
        fullName: fullName.trim(),
        reason: reason.trim(),
        vehiclePlate: vehiclePlate.trim() || null,
        notes: notes.trim() || null,
      });
    } else {
      await createDeniedVisitor.mutateAsync({
        fullName: fullName.trim(),
        reason: reason.trim(),
        vehiclePlate: vehiclePlate.trim() || null,
        notes: notes.trim() || null,
      });
    }

    onOpenChange(false);
  }

  const isPending = createDeniedVisitor.isPending || updateDeniedVisitor.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Denied Entry' : 'Add to Denied List'}</DialogTitle>
          <DialogDescription>
            Record a guest who should be flagged before check-in.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="denied-full-name">Full Name</Label>
            <Input
              id="denied-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Visitor full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="denied-reason">Reason</Label>
            <Textarea
              id="denied-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason for denied entry"
              required
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="denied-plate">Vehicle Plate</Label>
            <Input
              id="denied-plate"
              value={vehiclePlate}
              onChange={(event) => setVehiclePlate(event.target.value)}
              placeholder="Optional plate number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="denied-notes">Notes</Label>
            <Textarea
              id="denied-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
