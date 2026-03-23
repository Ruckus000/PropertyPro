'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AlertBanner } from '@/components/shared/alert-banner';
import { cn } from '@/lib/utils';

/* ─────── API helper ─────── */

async function approveRequest(requestId: number, unitId?: number): Promise<void> {
  const response = await fetch(`/api/v1/access-requests/${requestId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unitId: unitId ?? undefined }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Failed to approve request');
  }
}

/* ─────── Props ─────── */

interface ApproveDialogProps {
  requestId: number;
  requestName: string;
  onSuccess: () => void;
}

/* ─────── Component ─────── */

export function ApproveDialog({
  requestId,
  requestName,
  onSuccess,
}: ApproveDialogProps) {
  const [open, setOpen] = useState(false);
  const [unitIdInput, setUnitIdInput] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const parsed = parseInt(unitIdInput, 10);
      const unitId = unitIdInput.trim() && !isNaN(parsed) ? parsed : undefined;
      return approveRequest(requestId, unitId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['access-requests'] });
      setOpen(false);
      setUnitIdInput('');
      onSuccess();
    },
  });

  const handleOpenChange = (value: boolean) => {
    if (!mutation.isPending) {
      setOpen(value);
      if (!value) {
        setUnitIdInput('');
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
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              Grant portal access to {requestName}. Optionally assign them to a specific unit.
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
                  'focus:outline-none focus:ring-2 focus:ring-focus',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              />
              <p className="text-xs text-content-tertiary">
                Leave blank to approve without a unit assignment.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={mutation.isPending}
                className={cn(
                  'inline-flex min-h-[40px] items-center rounded-md border border-border-default px-4',
                  'text-sm font-medium text-content hover:bg-surface-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
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
