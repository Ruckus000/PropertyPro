'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertBanner } from '@/components/shared/alert-banner';
import { cn } from '@/lib/utils';

/* ─────── API helper ─────── */

async function denyRequest(requestId: number, reason?: string): Promise<void> {
  const response = await fetch(`/api/v1/access-requests/${requestId}/deny`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason?.trim() || undefined }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Failed to deny request');
  }
}

/* ─────── Props ─────── */

interface DenyDialogProps {
  requestId: number;
  requestName: string;
  onSuccess: () => void;
}

/* ─────── Component ─────── */

export function DenyDialog({ requestId, requestName, onSuccess }: DenyDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => denyRequest(requestId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['access-requests'] });
      setOpen(false);
      setReason('');
      onSuccess();
    },
  });

  const handleOpenChange = (value: boolean) => {
    if (!mutation.isPending) {
      setOpen(value);
      if (!value) {
        setReason('');
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
          'inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border-default px-3 py-2',
          'text-sm font-medium text-content hover:bg-surface-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          'md:min-h-[36px]',
        )}
      >
        <XCircle size={14} aria-hidden="true" />
        Deny
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Deny Request</DialogTitle>
            <DialogDescription>
              Deny portal access for {requestName}. Optionally provide a reason.
            </DialogDescription>
          </DialogHeader>

          {mutation.isError && (
            <AlertBanner
              status="danger"
              title="Failed to deny request"
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
                htmlFor="deny-reason"
                className="text-sm font-medium text-content"
              >
                Reason for denial
                <span className="ml-1 text-content-tertiary font-normal">(optional)</span>
              </label>
              <Textarea
                id="deny-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this request is being denied..."
                rows={3}
                disabled={mutation.isPending}
                className="resize-none"
              />
              <p className="text-xs text-content-tertiary">
                The reason may be shared with the applicant.
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
                  'inline-flex min-h-[40px] items-center gap-2 rounded-md border border-status-danger-border bg-status-danger-bg px-4',
                  'text-sm font-medium text-status-danger hover:bg-status-danger-subtle',
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
                    Denying...
                  </>
                ) : (
                  'Deny Request'
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
