'use client';

import type { CommunityType } from '@propertypro/shared';
import { ResidentForm, type ResidentFormSubmitValues } from '@/components/residents/resident-form';
import { AlertBanner } from '@/components/shared/alert-banner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Its own module so the Directory can use it without pulling in the old
// Residents page (measured: ~7 KiB off the Directory route).
export interface AddResidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityType: CommunityType;
  submitting: boolean;
  onSubmit: (values: ResidentFormSubmitValues) => Promise<void>;
  error: string | null;
  sendInvitation: boolean;
  onSendInvitationChange: (value: boolean) => void;
  /** Directory: choose the unit from a list instead of typing its id. */
  unitOptions?: readonly { id: number; label: string }[];
  /** Directory: "Add resident" from a unit's panel starts on that unit. */
  defaultUnitId?: number | null;
}

export function AddResidentDialog({
  open,
  onOpenChange,
  communityType,
  submitting,
  onSubmit,
  error,
  sendInvitation,
  onSendInvitationChange,
  unitOptions,
  defaultUnitId,
}: AddResidentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" resizable>
        <DialogHeader>
          <DialogTitle>Add Resident</DialogTitle>
          <DialogDescription>
            Add a new resident to the community. They will receive portal access.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <AlertBanner
            status="danger"
            title="Failed to add resident"
            description={error}
          />
        )}

        <ResidentForm
          // Remount per target unit so the preset unit is applied each open.
          key={defaultUnitId ?? 'none'}
          communityType={communityType}
          submitting={submitting}
          onSubmit={onSubmit}
          unitOptions={unitOptions}
          defaultValues={defaultUnitId ? { unitId: defaultUnitId } : undefined}
        />

        <label className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            checked={sendInvitation}
            onChange={(e) => onSendInvitationChange(e.target.checked)}
            className="h-4 w-4 rounded border-edge-strong"
          />
          <span className="text-sm text-content-secondary">
            Send invitation email
          </span>
        </label>
      </DialogContent>
    </Dialog>
  );
}
