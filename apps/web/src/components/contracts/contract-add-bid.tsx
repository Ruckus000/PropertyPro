'use client';

/**
 * "Add bid" on a contract's own page: a button that opens a small form in the
 * Bids section. It writes through the existing add-bid API, then asks the
 * server page to load again, so the count (and, once bidding has closed, the
 * new row) comes back through the one sealing rule. Nothing about any bid is
 * kept or shown here.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAddContractBid } from '@/hooks/use-contracts';
import { CONTRACT_VENDOR_REQUIRED_MESSAGE, contractAmountError } from '@/lib/contracts/contract-rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ContractAddBid({ communityId, contractId }: { communityId: number; contractId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [vendorError, setVendorError] = useState<string | null>(null);
  // The form replaces the button that opened it; when it closes (saved or
  // cancelled), focus goes back to that button and is not dropped on the page.
  const openButton = useRef<HTMLButtonElement>(null);
  const [returnFocus, setReturnFocus] = useState(false);
  useEffect(() => {
    if (!open && returnFocus) {
      openButton.current?.focus();
      setReturnFocus(false);
    }
  }, [open, returnFocus]);

  const addBid = useAddContractBid(communityId);
  const saveError = addBid.error instanceof Error ? addBid.error.message : null;

  function close() {
    setOpen(false);
    setReturnFocus(true);
    setVendorError(null);
    setVendorName('');
    setBidAmount('');
    setNotes('');
    setAmountError(null);
    addBid.reset();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amount = bidAmount.trim();
    const problem = contractAmountError(amount);
    // `required` lets a name made only of spaces through; the server would refuse it.
    const vendorProblem = vendorName.trim() === '' ? CONTRACT_VENDOR_REQUIRED_MESSAGE : null;
    setAmountError(problem);
    setVendorError(vendorProblem);
    if (problem || vendorProblem) return;

    try {
      await addBid.mutateAsync({
        contractId,
        vendorName: vendorName.trim(),
        bidAmount: amount,
        notes: notes.trim() || null,
      });
    } catch {
      return; // shown through `saveError`; the form stays open
    }
    close();
    router.refresh();
  }

  if (!open) {
    return (
      <div className="border-t border-edge px-4 py-3">
        <Button ref={openButton} type="button" variant="outline" onClick={() => setOpen(true)}>
          Add bid
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      aria-label="Add bid"
      className="flex flex-col gap-4 border-t border-edge px-4 py-4"
    >
      {saveError ? (
        <p role="alert" className="text-sm text-status-danger">
          {saveError}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bid-vendor">
            Vendor name <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="bid-vendor"
            required
            maxLength={500}
            // The form opens from a button it replaces, so focus moves into it.
            autoFocus
            value={vendorName}
            onChange={(event) => setVendorName(event.target.value)}
            aria-invalid={vendorError ? true : undefined}
            aria-describedby={vendorError ? 'bid-vendor-error' : undefined}
          />
          {vendorError ? (
            <p id="bid-vendor-error" role="alert" className="text-sm text-status-danger">
              {vendorError}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bid-amount">
            Bid amount ($) <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="bid-amount"
            required
            inputMode="decimal"
            placeholder="0.00"
            value={bidAmount}
            onChange={(event) => setBidAmount(event.target.value)}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? 'bid-amount-error' : undefined}
          />
          {amountError ? (
            <p id="bid-amount-error" role="alert" className="text-sm text-status-danger">
              {amountError}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="bid-notes">Notes</Label>
        <Textarea id="bid-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={addBid.isPending}>
          {addBid.isPending ? 'Saving…' : 'Save bid'}
        </Button>
      </div>
    </form>
  );
}
