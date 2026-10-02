'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useApproveAccessRequest } from '@/hooks/use-access-requests';
import { cn } from '@/lib/utils';

/* ─────── Props ─────── */

export interface UnitOption {
  id: number;
  /** e.g. "101 · Building A" — the number alone is ambiguous across buildings. */
  label: string;
}

interface ApproveDialogProps {
  requestId: number;
  requestName: string;
  onSuccess: () => void;
  /**
   * When provided, the unit is picked from this list and is REQUIRED (the
   * Directory's rule). Without it, the legacy optional numeric input renders.
   */
  unitOptions?: readonly UnitOption[];
  /** Pre-selects the unit the applicant claimed, when it matched one. */
  claimedUnitId?: number | null;
  claimedUnitIdentifier?: string | null;
}

/* ─────── Component ─────── */

export function ApproveDialog({
  requestId,
  requestName,
  onSuccess,
  unitOptions,
  claimedUnitId = null,
  claimedUnitIdentifier = null,
}: ApproveDialogProps) {
  const [open, setOpen] = useState(false);
  const pickUnit = unitOptions !== undefined;
  const initialUnit =
    pickUnit && claimedUnitId !== null && unitOptions.some((u) => u.id === claimedUnitId)
      ? String(claimedUnitId)
      : '';
  const [unitIdInput, setUnitIdInput] = useState(initialUnit);
  const mutation = useApproveAccessRequest();
  const unitMissing = pickUnit && unitIdInput === '';

  const handleApprove = () => {
    if (unitMissing) return;
    const parsed = parseInt(unitIdInput, 10);
    const unitId = unitIdInput.trim() && !isNaN(parsed) ? parsed : undefined;

    mutation.mutate(
      { requestId, unitId },
      {
        onSuccess: () => {
          setOpen(false);
          setUnitIdInput(initialUnit);
          onSuccess();
        },
      },
    );
  };

  const handleOpenChange = (value: boolean) => {
    if (!mutation.isPending) {
      setOpen(value);
      if (!value) {
        setUnitIdInput(initialUnit);
        mutation.reset();
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-interactive px-3 py-2',
          'text-sm font-medium text-content-inverse hover:bg-interactive-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          'md:min-h-[36px]',
        )}
      >
        <CheckCircle2 size={14} aria-hidden="true" />
        Approve
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              {pickUnit
                ? `Grant portal access to ${requestName} and link them to a unit.`
                : `Grant portal access to ${requestName}. Optionally assign them to a specific unit.`}
            </DialogDescription>
          </DialogHeader>

          {mutation.isError && (
            <AlertBanner
              status="danger"
              title="Failed to approve request"
              description={
                mutation.error instanceof Error
                  ? mutation.error.message
                  : 'An unexpected error occurred. Please try again.'
              }
            />
          )}

          <div className="space-y-4 pt-2">
            {pickUnit ? (
              <div className="space-y-1.5">
                <label htmlFor={`approve-unit-${requestId}`} className="text-sm font-medium text-content">
                  Unit <span className="text-status-danger">*</span>
                </label>
                <select
                  id={`approve-unit-${requestId}`}
                  required
                  value={unitIdInput}
                  onChange={(e) => setUnitIdInput(e.target.value)}
                  disabled={mutation.isPending}
                  className={cn(
                    'flex h-10 w-full rounded-md border border-edge bg-surface-card px-3',
                    'text-base text-content',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <option value="" disabled>
                    Choose a unit
                  </option>
                  {unitOptions.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.label}
                    </option>
                  ))}
                </select>
                {claimedUnitIdentifier && initialUnit === '' ? (
                  <p role="status" className="text-xs text-status-warning">
                    They claimed unit &ldquo;{claimedUnitIdentifier}&rdquo;, which does not exist. Choose the right one.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label
                  htmlFor="unit-id-input"
                  className="text-sm font-medium text-content"
                >
                  Unit assignment
                  <span className="ml-1 text-content-tertiary font-normal">(optional)</span>
                </label>
                <input
                  id="unit-id-input"
                  type="number"
                  min="1"
                  value={unitIdInput}
                  onChange={(e) => setUnitIdInput(e.target.value)}
                  placeholder="Enter unit ID"
                  disabled={mutation.isPending}
                  className={cn(
                    'flex h-10 w-full rounded-md border border-edge bg-transparent px-3 py-2',
                    'text-sm placeholder:text-content-placeholder',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                />
                <p className="text-xs text-content-tertiary">
                  Leave blank to approve without a unit assignment.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={mutation.isPending}
                className={cn(
                  'inline-flex min-h-[40px] items-center rounded-md border border-edge px-4',
                  'text-sm font-medium text-content hover:bg-surface-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={mutation.isPending || unitMissing}
                className={cn(
                  'inline-flex min-h-[40px] items-center gap-2 rounded-md bg-interactive px-4',
                  'text-sm font-medium text-content-inverse hover:bg-interactive-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {mutation.isPending ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden="true"
                    />
                    Approving...
                  </>
                ) : (
                  'Approve Request'
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
