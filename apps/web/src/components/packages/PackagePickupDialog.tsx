'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePickupPackage, type PackageListItem } from '@/hooks/use-packages';
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

interface PackagePickupDialogProps {
  communityId: number;
  /** The package being picked up; null keeps the dialog closed. */
  pkg: PackageListItem | null;
  onClose: () => void;
}

/** Pickup confirmation shared by the current and the redesigned staff views. */
export function PackagePickupDialog({ communityId, pkg, onClose }: PackagePickupDialogProps) {
  const [pickedUpByName, setPickedUpByName] = useState('');
  const pickupMutation = usePickupPackage(communityId);

  // Each package starts with an empty name.
  useEffect(() => {
    setPickedUpByName('');
  }, [pkg]);

  const handlePickup = useCallback(async () => {
    if (!pkg || !pickedUpByName.trim()) return;
    await pickupMutation.mutateAsync({
      packageId: pkg.id,
      pickedUpByName: pickedUpByName.trim(),
    });
    onClose();
    setPickedUpByName('');
  }, [pkg, pickedUpByName, pickupMutation, onClose]);

  return (
    <Dialog
      open={pkg !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Mark as Picked Up</DialogTitle>
          <DialogDescription>
            Confirm pickup for {pkg?.recipientName}&apos;s {pkg?.carrier} package.
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
          <Button variant="outline" onClick={onClose}>
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
  );
}
