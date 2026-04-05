'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';

interface JoinRequestFormProps {
  communityId: number;
  communityName: string;
  onDone: () => void;
  onBack: () => void;
}

const REASON_MESSAGES: Record<string, string> = {
  already_member: "You're already a member of this community.",
  pending_request: 'You already have a pending request for this community.',
  recently_denied:
    'A previous request for this community was denied in the last 30 days. Please contact your community admin.',
};

export function JoinRequestForm({
  communityId,
  communityName,
  onDone,
  onBack,
}: JoinRequestFormProps) {
  const [unit, setUnit] = useState('');
  const [residentType, setResidentType] = useState<'owner' | 'tenant'>('owner');

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/account/join-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          unitIdentifier: unit.trim(),
          residentType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason =
          (body?.error?.details?.reason as string | undefined) ??
          (body?.error?.code as string | undefined) ??
          '';
        const message = REASON_MESSAGES[reason] ?? body?.error?.message ?? 'Submission failed. Please try again.';
        throw new Error(message);
      }
      return body;
    },
    onSuccess: onDone,
  });

  const canSubmit = unit.trim().length > 0 && !submit.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Join {communityName}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Provide your unit details so the community admin can verify your request.
        </p>
      </div>

      {submit.error && (
        <AlertBanner
          status="danger"
          title="Request could not be submitted"
          description={submit.error.message}
        />
      )}

      <div>
        <label htmlFor="unit-identifier" className="block text-sm font-medium mb-2">
          Unit identifier <span className="text-destructive">*</span>
        </label>
        <Input
          id="unit-identifier"
          placeholder="e.g. Unit 101 or Lot 12"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          maxLength={50}
        />
      </div>

      <div>
        <label htmlFor="resident-type" className="block text-sm font-medium mb-2">
          I am a(n) <span className="text-destructive">*</span>
        </label>
        <select
          id="resident-type"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={residentType}
          onChange={(e) => setResidentType(e.target.value as 'owner' | 'tenant')}
        >
          <option value="owner">Owner</option>
          <option value="tenant">Tenant</option>
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="ghost" onClick={onBack} disabled={submit.isPending}>
          Back
        </Button>
        <Button onClick={() => submit.mutate()} disabled={!canSubmit}>
          {submit.isPending ? 'Submitting…' : 'Submit Request'}
        </Button>
      </div>
    </div>
  );
}
