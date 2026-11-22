'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateMaintenanceRequestStatus, type UpdateMaintenanceStatusInput } from '@/hooks/use-operations';
import type { MaintenanceRequestItem } from '@/lib/api/maintenance-requests';
import { getStatusConfig } from '@/lib/constants/status';
import { allowedNextStatuses } from '@/lib/maintenance/status-transitions';

interface StatusUpdateFormProps {
  request: MaintenanceRequestItem;
  communityId: number;
  onUpdated?: () => void;
}

/**
 * The manager's status control. It offers only the moves the server accepts:
 * both read `lib/maintenance/status-transitions.ts`. Render it for managers
 * only; the PATCH route refuses everyone else regardless.
 *
 * Mount it with `key={request.status}` so the choices restart from the new
 * status after an update.
 *
 * It opens on "Keep current status", never on a move: several statuses can move
 * backward (`acknowledged` and `in_progress` both go back to `submitted`), and a
 * status change emails the resident. A manager who only edits the internal
 * notes sends the notes alone.
 */
export function StatusUpdateForm({ request, communityId, onUpdated }: StatusUpdateFormProps) {
  const currentStatus = request.status === 'open' ? 'submitted' : request.status;
  const allowed = allowedNextStatuses(currentStatus);
  const savedNotes = request.internalNotes ?? '';

  // '' is "Keep current status": the PATCH then carries no `status`.
  const [newStatus, setNewStatus] = useState('');
  const [internalNotes, setInternalNotes] = useState(savedNotes);
  const [resolutionDescription, setResolutionDescription] = useState(request.resolutionDescription ?? '');
  const [resolutionDate, setResolutionDate] = useState(
    request.resolutionDate ? request.resolutionDate.split('T')[0]! : '',
  );
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateMaintenanceRequestStatus(communityId, request.id);

  const isResolving = newStatus === 'resolved';
  const notesChanged = internalNotes !== savedNotes;
  const hasChanges = newStatus !== '' || notesChanged;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasChanges) return;
    setError(null);
    const input: UpdateMaintenanceStatusInput = {};
    if (newStatus) input.status = newStatus;
    // Send the notes only when they changed, so the audit trail records real edits.
    if (notesChanged) input.internalNotes = internalNotes || null;
    if (isResolving) {
      input.resolutionDescription = resolutionDescription || null;
      if (resolutionDate) input.resolutionDate = `${resolutionDate}T00:00:00Z`;
    }
    try {
      await update.mutateAsync(input);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't update the status. Please try again.");
    }
  }

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-content-tertiary">
        This request is {getStatusConfig(currentStatus).label.toLowerCase()}. Its status can no longer change.
      </p>
    );
  }

  const statusId = `status-${request.id}`;
  const notesId = `notes-${request.id}`;
  const resolutionId = `resolution-${request.id}`;
  const resolutionDateId = `resolution-date-${request.id}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={statusId}>Change status</Label>
        <select
          id={statusId}
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          className="flex h-11 w-full rounded-sm border border-edge-strong bg-transparent px-3 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus md:h-8 md:text-sm"
        >
          <option value="">Keep current status ({getStatusConfig(currentStatus).label})</option>
          {allowed.map((s) => (
            <option key={s} value={s}>
              {getStatusConfig(s).label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor={notesId}>Internal notes</Label>
        <Textarea
          id={notesId}
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          placeholder="Not visible to residents"
        />
      </div>

      {isResolving && (
        <>
          <div className="space-y-1">
            <Label htmlFor={resolutionId}>Resolution description</Label>
            <Textarea
              id={resolutionId}
              value={resolutionDescription}
              onChange={(e) => setResolutionDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={resolutionDateId}>Resolution date</Label>
            <Input
              id={resolutionDateId}
              type="date"
              value={resolutionDate}
              onChange={(e) => setResolutionDate(e.target.value)}
            />
          </div>
        </>
      )}

      {error && (
        <p className="text-sm text-status-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="sm" disabled={update.isPending || !hasChanges}>
        {update.isPending ? 'Saving...' : newStatus ? 'Update status' : 'Save notes'}
      </Button>
    </form>
  );
}
