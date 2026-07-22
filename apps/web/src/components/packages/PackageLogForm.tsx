'use client';

import { useState } from 'react';
import { useCreatePackage } from '@/hooks/use-packages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface PackageLogFormProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CARRIER_OPTIONS = ['UPS', 'FedEx', 'USPS', 'Amazon', 'DHL', 'Other'] as const;

export function PackageLogForm({
  communityId,
  open,
  onOpenChange,
}: PackageLogFormProps) {
  const createPackage = useCreatePackage(communityId);

  const [unitNumber, setUnitNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setUnitNumber('');
    setRecipientName('');
    setCarrier('');
    setTrackingNumber('');
    setNotes('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedUnitNumber = unitNumber.trim();
    if (!trimmedUnitNumber) return;
    if (!recipientName.trim()) return;
    if (!carrier.trim()) return;

    try {
      await createPackage.mutateAsync({
        unitNumber: trimmedUnitNumber,
        recipientName: recipientName.trim(),
        carrier: carrier.trim(),
        trackingNumber: trackingNumber.trim() || null,
        notes: notes.trim() || null,
      });
    } catch {
      return;
    }

    resetForm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" resizable>
        <DialogHeader>
          <DialogTitle>Log Package</DialogTitle>
          <DialogDescription>
            Record a new package received at the front desk.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pkg-unit">Unit</Label>
            <Input
              id="pkg-unit"
              type="text"
              autoComplete="off"
              placeholder="e.g. 4B or 101"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              required
            />
            {createPackage.isError && (
              <p
                className="text-xs"
                role="alert"
                style={{ color: 'var(--status-danger)' }}
              >
                {createPackage.error instanceof Error
                  ? createPackage.error.message
                  : 'Failed to log package. Please try again.'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pkg-recipient">Recipient Name</Label>
            <Input
              id="pkg-recipient"
              placeholder="Jane Smith"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Carrier</Label>
            <div className="flex flex-wrap gap-2">
              {CARRIER_OPTIONS.map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    carrier === opt &&
                      'border-primary bg-primary/10 text-primary',
                  )}
                  onClick={() => setCarrier(opt)}
                >
                  {opt}
                </Button>
              ))}
            </div>
            {carrier === 'Other' && (
              <Input
                placeholder="Enter carrier name"
                value={carrier === 'Other' ? '' : carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pkg-tracking">
              Tracking #{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="pkg-tracking"
              placeholder="1Z999AA10123456784"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pkg-notes">Notes</Label>
            <Textarea
              id="pkg-notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createPackage.isPending}>
              {createPackage.isPending ? 'Logging...' : 'Log Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
