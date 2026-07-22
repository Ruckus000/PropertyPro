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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useCreateInsurancePolicy, useUpdateInsurancePolicy } from '@/hooks/use-insurance';
import {
  INSURANCE_POLICY_TYPE_LABELS,
  type InsurancePolicyRecord,
  type InsurancePolicyType,
} from './types';

interface Props {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: InsurancePolicyRecord | null;
}

const POLICY_TYPES = Object.keys(INSURANCE_POLICY_TYPE_LABELS) as InsurancePolicyType[];

export function InsurancePolicyFormDialog({ communityId, open, onOpenChange, editing }: Props) {
  const isEdit = editing !== null;
  const create = useCreateInsurancePolicy(communityId);
  const update = useUpdateInsurancePolicy(communityId);

  const [policyType, setPolicyType] = React.useState<InsurancePolicyType>('property');
  const [carrierName, setCarrierName] = React.useState('');
  const [policyNumber, setPolicyNumber] = React.useState('');
  const [coverageSummary, setCoverageSummary] = React.useState('');
  const [deductibleSummary, setDeductibleSummary] = React.useState('');
  const [effectiveAt, setEffectiveAt] = React.useState('');
  const [expiresAt, setExpiresAt] = React.useState('');
  const [agentName, setAgentName] = React.useState('');
  const [agentEmail, setAgentEmail] = React.useState('');
  const [agentPhone, setAgentPhone] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setPolicyType(editing?.policyType ?? 'property');
    setCarrierName(editing?.carrierName ?? '');
    setPolicyNumber(editing?.policyNumber ?? '');
    setCoverageSummary(editing?.coverageSummary ?? '');
    setDeductibleSummary(editing?.deductibleSummary ?? '');
    setEffectiveAt(editing?.effectiveAt ?? '');
    setExpiresAt(editing?.expiresAt ?? '');
    setAgentName(editing?.agentName ?? '');
    setAgentEmail(editing?.agentEmail ?? '');
    setAgentPhone(editing?.agentPhone ?? '');
  }, [open, editing]);

  const isPending = create.isPending || update.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!carrierName.trim() || !expiresAt) {
      setError('Enter the carrier and the policy expiry date.');
      return;
    }
    const payload = {
      policyType,
      carrierName: carrierName.trim(),
      policyNumber: policyNumber.trim() || null,
      coverageSummary: coverageSummary.trim() || null,
      deductibleSummary: deductibleSummary.trim() || null,
      effectiveAt: effectiveAt || null,
      expiresAt,
      agentName: agentName.trim() || null,
      agentEmail: agentEmail.trim() || null,
      agentPhone: agentPhone.trim() || null,
    };
    try {
      if (isEdit) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t save this policy. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit master policy' : 'Add master policy'}</DialogTitle>
          <DialogDescription>
            Enter what the declarations page says. Owners see this summary and can request a
            certificate for their lender from the agent of record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <AlertBanner status="danger" title={error} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pol-type">Policy type *</Label>
              <Select value={policyType} onValueChange={(v) => setPolicyType(v as InsurancePolicyType)}>
                <SelectTrigger id="pol-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {INSURANCE_POLICY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pol-carrier">Carrier *</Label>
              <Input id="pol-carrier" value={carrierName} onChange={(e) => setCarrierName(e.target.value)} maxLength={300} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pol-number">Policy number (optional)</Label>
            <Input id="pol-number" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} maxLength={120} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pol-coverage">Coverage summary (optional)</Label>
            <Textarea
              id="pol-coverage"
              value={coverageSummary}
              onChange={(e) => setCoverageSummary(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Limits as written on the declarations page"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pol-deductible">Deductibles (optional)</Label>
            <Textarea
              id="pol-deductible"
              value={deductibleSummary}
              onChange={(e) => setDeductibleSummary(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Include the hurricane deductible (often a % of insured value)"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pol-effective">Effective date (optional)</Label>
              <Input id="pol-effective" type="date" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pol-expires">Expiry date *</Label>
              <Input id="pol-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pol-agent">Agent name (optional)</Label>
              <Input id="pol-agent" value={agentName} onChange={(e) => setAgentName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pol-agent-email">Agent email (optional)</Label>
              <Input id="pol-agent-email" type="email" value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} maxLength={320} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pol-agent-phone">Agent phone (optional)</Label>
              <Input id="pol-agent-phone" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} maxLength={60} />
            </div>
          </div>
          <p className="text-xs text-content-tertiary">
            Add the agent’s email so owners can send certificate requests to the agent of record.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
