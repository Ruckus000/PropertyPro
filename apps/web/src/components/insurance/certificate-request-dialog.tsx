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
import { AlertBanner } from '@/components/shared/alert-banner';
import { useRequestCertificate } from '@/hooks/use-insurance';
import { INSURANCE_CERTIFICATE_REQUEST_HINT } from '@/lib/constants/insurance-disclaimers';
import type { InsurancePolicyRecord } from './types';

interface Props {
  communityId: number;
  policy: InsurancePolicyRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the unit from the member's own unit where known. */
  defaultUnitLabel?: string;
}

export function CertificateRequestDialog({
  communityId,
  policy,
  open,
  onOpenChange,
  defaultUnitLabel,
}: Props) {
  const request = useRequestCertificate(communityId);
  const [unitLabel, setUnitLabel] = React.useState('');
  const [recipientName, setRecipientName] = React.useState('');
  const [recipientEmail, setRecipientEmail] = React.useState('');
  const [loanNumber, setLoanNumber] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setSent(false);
    setUnitLabel(defaultUnitLabel ?? '');
    setRecipientName('');
    setRecipientEmail('');
    setLoanNumber('');
  }, [open, defaultUnitLabel]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!policy) return;
    if (!unitLabel.trim() || !recipientName.trim() || !recipientEmail.trim()) {
      setError('Enter your unit, and the lender or title company’s name and email.');
      return;
    }
    try {
      await request.mutateAsync({
        policyId: policy.id,
        unitLabel: unitLabel.trim(),
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
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <AlertBanner status="danger" title={error} />}
            <div className="space-y-2">
              <Label htmlFor="cert-unit">Your unit *</Label>
              <Input id="cert-unit" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} maxLength={120} />
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
