'use client';

import type { DeniedMatchItem } from '@/hooks/use-denied-visitors';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeniedMatchWarningProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: DeniedMatchItem[];
  visitorName: string;
  onConfirm: () => Promise<void> | void;
}

export function DeniedMatchWarning({
  open,
  onOpenChange,
  matches,
  visitorName,
  onConfirm,
}: DeniedMatchWarningProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Denied-list match found</DialogTitle>
          <DialogDescription>
            {visitorName} matched one or more denied-entry records. Review the matches before
            checking this visitor in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {matches.map((match) => (
            <div key={match.id} className="rounded-lg border border-status-warning-bg bg-status-warning-bg/40 p-3">
              <p className="font-medium text-sm">{match.fullName}</p>
              <p className="mt-1 text-sm text-content-secondary">{match.reason}</p>
              {match.vehiclePlate ? (
                <p className="mt-1 text-xs text-content-tertiary">Plate: {match.vehiclePlate}</p>
              ) : null}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onConfirm()}>
            Check In Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
