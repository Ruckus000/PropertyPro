'use client';

import * as React from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useRequestCertificate } from '@/hooks/use-insurance';
import { INSURANCE_CERTIFICATE_REQUEST_HINT } from '@/lib/constants/insurance-disclaimers';
import type { InsurancePolicyRecord, OwnUnitOption } from './types';

interface Props {
  communityId: number;
  policy: InsurancePolicyRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The member's own units. The request can only name one of these — the
   * server refuses any other and derives the label the agent sees.
   */
  ownUnits: readonly OwnUnitOption[];
}

export function CertificateRequestDialog({
  communityId,
  policy,
  open,
  onOpenChange,
  ownUnits,
}: Props) {
  const request = useRequestCertificate(communityId);
  const onlyUnitId = ownUnits.length === 1 ? String(ownUnits[0]!.id) : '';
  const [unitId, setUnitId] = React.useState('');
  const [recipientName, setRecipientName] = React.useState('');
  const [recipientEmail, setRecipientEmail] = React.useState('');
  const [loanNumber, setLoanNumber] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setSent(false);
    setUnitId(onlyUnitId);
    setRecipientName('');
    setRecipientEmail('');
    setLoanNumber('');
  }, [open, onlyUnitId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!policy) return;
    if (!unitId || !recipientName.trim() || !recipientEmail.trim()) {
      setError('Choose your unit, and enter the lender or title company’s name and email.');
      return;
    }
    try {
      await request.mutateAsync({
        policyId: policy.id,
        unitId: Number(unitId),
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        loanNumber: loanNumber.trim() || null,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t send the request. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" resizable>
        <DialogHeader>
          <DialogTitle>Request a certificate for my lender</DialogTitle>
          <DialogDescription>{INSURANCE_CERTIFICATE_REQUEST_HINT}</DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4">
            <AlertBanner
              status="success"
              title="Request sent"
              description={`We sent your request to ${policy?.agentName ?? 'the agent'}. They'll reply to your email.`}
            />
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : ownUnits.length === 0 ? (
          <div className="space-y-4">
            <AlertBanner
              status="info"
              title="Your account isn’t linked to a unit yet"
              description="A certificate is issued for your unit. Ask your manager to link your unit to your account, then send the request."
            />
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <AlertBanner status="danger" title={error} />}
            <div className="space-y-2">
              <Label htmlFor="cert-unit">Your unit *</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="cert-unit">
                  <SelectValue placeholder="Choose your unit" />
                </SelectTrigger>
                <SelectContent>
                  {ownUnits.map((unit) => (
                    <SelectItem key={unit.id} value={String(unit.id)}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert-recipient">Lender / title company *</Label>
              <Input
                id="cert-recipient"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert-email">Their email *</Label>
              <Input
                id="cert-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                maxLength={320}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert-loan">Loan / reference number (optional)</Label>
              <Input id="cert-loan" value={loanNumber} onChange={(e) => setLoanNumber(e.target.value)} maxLength={120} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={request.isPending}>
                {request.isPending ? 'Sending…' : 'Send request'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
