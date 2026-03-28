'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useCancelElection,
  useCertifyElection,
  useCloseElection,
  useOpenElection,
} from '@/hooks/use-board';

interface ElectionAdminActionsProps {
  communityId: number;
  electionId: number;
  status: string;
  isAdmin: boolean;
}

export function ElectionAdminActions({
  communityId,
  electionId,
  status,
  isAdmin,
}: ElectionAdminActionsProps) {
  const openElection = useOpenElection(communityId, electionId);
  const closeElection = useCloseElection(communityId, electionId);
  const certifyElection = useCertifyElection(communityId, electionId);
  const cancelElection = useCancelElection(communityId, electionId);

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [certifyDialog, setCertifyDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [resultsDocumentId, setResultsDocumentId] = useState('');
  const [canceledReason, setCanceledReason] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isAdmin) {
    return null;
  }

  const cancelable = status === 'open' || status === 'closed';
  const sharedError =
    openElection.error ??
    closeElection.error ??
    certifyElection.error ??
    cancelElection.error;

  return (
    <div className="space-y-3 rounded-xl border border-edge bg-surface-card p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-content">Admin actions</h3>
        <p className="text-sm text-content-secondary">These actions are re-authorized on the server before they are applied.</p>
      </div>

      {sharedError ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn't update this election."
          description={sharedError instanceof Error ? sharedError.message : 'Please try again.'}
        />
      ) : null}

      {successMessage ? (
        <AlertBanner status="success" variant="subtle" title={successMessage} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === 'draft' ? (
          <>
            <Button type="button" className="h-11 md:h-9" onClick={() => setOpenDialog(true)}>
              Open Election
            </Button>
            <AlertDialog open={openDialog} onOpenChange={setOpenDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Open election?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will open the election for voting and snapshot eligible voters. Proceed?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={openElection.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={openElection.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      void openElection.mutateAsync().then(() => {
                        setSuccessMessage('Election opened.');
                        setOpenDialog(false);
                      });
                    }}
                  >
                    {openElection.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}

        {status === 'open' ? (
          <>
            <Button type="button" variant="secondary" className="h-11 md:h-9" onClick={() => setCloseDialog(true)}>
              Close Election
            </Button>
            <AlertDialog open={closeDialog} onOpenChange={setCloseDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close election?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close voting. Results will become visible.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={closeElection.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={closeElection.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      void closeElection.mutateAsync().then(() => {
                        setSuccessMessage('Election closed.');
                        setCloseDialog(false);
                      });
                    }}
                  >
                    {closeElection.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}

        {status === 'closed' ? (
          <>
            <Button type="button" className="h-11 md:h-9" onClick={() => setCertifyDialog(true)}>
              Certify Results
            </Button>
            <AlertDialog open={certifyDialog} onOpenChange={setCertifyDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Certify results?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Finalize this election and optionally attach a results document ID.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={resultsDocumentId}
                  onChange={(event) => setResultsDocumentId(event.target.value)}
                  placeholder="Results document ID (optional)"
                  className="h-11 md:h-9"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={certifyElection.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={certifyElection.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      void certifyElection.mutateAsync({
                        resultsDocumentId: resultsDocumentId.trim() ? Number(resultsDocumentId) : null,
                      }).then(() => {
                        setSuccessMessage('Election certified.');
                        setCertifyDialog(false);
                        setResultsDocumentId('');
                      });
                    }}
                  >
                    {certifyElection.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}

        {cancelable ? (
          <>
            <Button type="button" variant="destructive" className="h-11 md:h-9" onClick={() => setCancelDialog(true)}>
              Cancel Election
            </Button>
            <AlertDialog open={cancelDialog} onOpenChange={setCancelDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel election?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Provide a reason between 1 and 500 characters. This will permanently mark the election as canceled.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  value={canceledReason}
                  onChange={(event) => setCanceledReason(event.target.value)}
                  maxLength={500}
                  placeholder="Explain why this election is being canceled"
                  className="min-h-28"
                />
                <p className="text-xs text-content-secondary">{canceledReason.trim().length}/500</p>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={cancelElection.isPending}>Keep election</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={cancelElection.isPending || canceledReason.trim().length === 0 || canceledReason.trim().length > 500}
                    onClick={(event) => {
                      event.preventDefault();
                      void cancelElection.mutateAsync({
                        canceledReason: canceledReason.trim(),
                      }).then(() => {
                        setSuccessMessage('Election canceled.');
                        setCancelDialog(false);
                        setCanceledReason('');
                      });
                    }}
                  >
                    {cancelElection.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </div>
    </div>
  );
}
