'use client';

import { useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
  useCheckinVisitor,
  useCheckoutVisitor,
  useRevokeVisitor,
  type VisitorListItem,
} from '@/hooks/use-visitors';
import { fetchDeniedMatches, type DeniedMatchItem } from '@/hooks/use-denied-visitors';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { VisitorColumnActions } from './visitor-columns';
import { DeniedMatchWarning } from './DeniedMatchWarning';

/** A refused check-in (expired, not yet valid, wrong day) must say why at the gate. */
function showMutationError(error: unknown) {
  toast.error(
    error instanceof Error && error.message
      ? error.message
      : "We couldn't update this visitor. Please try again.",
  );
}

/**
 * The gate actions both staff views share: check in (with the denied-list
 * match warning), check out, and revoke (with its reason dialog). `dialogs`
 * must be rendered once by the view.
 */
export function useVisitorStaffActions(communityId: number): {
  actions: VisitorColumnActions;
  dialogs: ReactNode;
} {
  const [pendingMatches, setPendingMatches] = useState<DeniedMatchItem[]>([]);
  const [matchWarningOpen, setMatchWarningOpen] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<VisitorListItem | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<VisitorListItem | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const checkinMutation = useCheckinVisitor(communityId);
  const checkoutMutation = useCheckoutVisitor(communityId);
  const revokeMutation = useRevokeVisitor(communityId);

  const handleCheckIn = useCallback(
    async (visitor: VisitorListItem) => {
      let matches: DeniedMatchItem[] = [];
      try {
        matches = await fetchDeniedMatches(
          communityId,
          visitor.visitorName,
          visitor.vehiclePlate,
        );
      } catch {
        // Denied-match check is best-effort — proceed with check-in on failure
      }

      if (matches.length > 0) {
        setPendingMatches(matches);
        setPendingCheckIn(visitor);
        setMatchWarningOpen(true);
        return;
      }

      await checkinMutation.mutateAsync(visitor.id).catch(showMutationError);
    },
    [checkinMutation, communityId],
  );

  const handleCheckOut = useCallback(
    async (visitor: VisitorListItem) => {
      await checkoutMutation.mutateAsync(visitor.id).catch(showMutationError);
    },
    [checkoutMutation],
  );

  const handleConfirmDeniedMatch = useCallback(async () => {
    if (!pendingCheckIn) return;
    await checkinMutation.mutateAsync(pendingCheckIn.id).catch(showMutationError);
    setPendingCheckIn(null);
    setPendingMatches([]);
    setMatchWarningOpen(false);
  }, [checkinMutation, pendingCheckIn]);

  const handleRevoke = useCallback((visitor: VisitorListItem) => {
    setRevokeTarget(visitor);
    setRevokeReason('');
  }, []);

  const actions: VisitorColumnActions = useMemo(
    () => ({
      onCheckIn: handleCheckIn,
      onCheckOut: handleCheckOut,
      onRevoke: handleRevoke,
    }),
    [handleCheckIn, handleCheckOut, handleRevoke],
  );

  const dialogs = (
    <>
      <DeniedMatchWarning
        open={matchWarningOpen}
        onOpenChange={setMatchWarningOpen}
        matches={pendingMatches}
        visitorName={pendingCheckIn?.visitorName ?? 'This visitor'}
        onConfirm={handleConfirmDeniedMatch}
      />

      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeReason('');
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Revoke Visitor Pass</DialogTitle>
            <DialogDescription>
              Add a reason for revoking {revokeTarget?.visitorName}&apos;s pass.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
            placeholder="Required reason"
            rows={4}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!revokeReason.trim() || revokeMutation.isPending}
              onClick={async () => {
                if (!revokeTarget) return;
                await revokeMutation.mutateAsync({
                  visitorId: revokeTarget.id,
                  reason: revokeReason.trim(),
                });
                setRevokeTarget(null);
                setRevokeReason('');
              }}
            >
              {revokeMutation.isPending ? 'Revoking...' : 'Revoke Pass'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { actions, dialogs };
}
