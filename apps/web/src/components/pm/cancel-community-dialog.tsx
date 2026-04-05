'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertBanner } from '@/components/shared/alert-banner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CancelPreview {
  previousTier: string;
  newTier: string;
  perCommunityBreakdown: Array<{
    basePriceUsd: number;
    discountedPriceUsd: number;
    discountPercent: number;
  }>;
  portfolioMonthlyDeltaUsd: number;
}

interface CancelCommunityDialogProps {
  open: boolean;
  onClose: () => void;
  communityId: number;
  communityName: string;
  onCanceled?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CancelCommunityDialog({
  open,
  onClose,
  communityId,
  communityName,
  onCanceled,
}: CancelCommunityDialogProps) {
  const [confirmText, setConfirmText] = useState('');

  const preview = useQuery<{ data: CancelPreview }>({
    queryKey: ['cancel-preview', communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/communities/${communityId}/cancel-preview`);
      if (!res.ok) throw new Error('Failed to load impact');
      return res.json() as Promise<{ data: CancelPreview }>;
    },
    enabled: open,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/communities/${communityId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Cancel failed');
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      setConfirmText('');
      onCanceled?.();
      onClose();
    },
  });

  const handleClose = () => {
    setConfirmText('');
    cancel.reset();
    onClose();
  };

  const impact = preview.data?.data;
  const hasDowngrade = impact && impact.previousTier !== impact.newTier;
  const canConfirm = confirmText === 'CONFIRM';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel {communityName}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Portfolio discount impact warning */}
          {hasDowngrade && impact && (
            <AlertBanner
              status="danger"
              variant="subtle"
              title="Portfolio discount will decrease"
              description={
                <>
                  Your volume discount will drop from {impact.previousTier.replace('tier_', '')}%
                  to {impact.newTier.replace('tier_', '')}%. Your remaining communities will cost{' '}
                  <strong>
                    ${Math.abs(impact.portfolioMonthlyDeltaUsd).toFixed(2)}/mo more
                  </strong>
                  .
                </>
              }
            />
          )}

          {/* Confirmation input */}
          <div className="space-y-2">
            <Label htmlFor="cancel-community-confirm">
              Type <strong>CONFIRM</strong> to proceed
            </Label>
            <Input
              id="cancel-community-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              autoComplete="off"
            />
          </div>

          {/* Mutation error */}
          {cancel.error && (
            <p className="text-sm" style={{ color: 'var(--text-error)' }}>
              {cancel.error.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Keep Community
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm || cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? 'Canceling…' : 'Cancel Community'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
