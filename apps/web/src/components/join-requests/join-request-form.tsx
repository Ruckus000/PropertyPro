'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useCreateJoinRequest } from '@/hooks/use-join-requests';

interface JoinRequestFormProps {
  communityId: number;
  communityName: string;
  onDone: () => void;
  onBack: () => void;
}

export function JoinRequestForm({
  communityId,
  communityName,
  onDone,
  onBack,
}: JoinRequestFormProps) {
  const [unit, setUnit] = useState('');
  const [residentType, setResidentType] = useState<'owner' | 'tenant'>('owner');

  const submit = useCreateJoinRequest();

  const canSubmit = unit.trim().length > 0 && !submit.isPending;

  const handleSubmit = () => {
    submit.mutate(
      { communityId, unitIdentifier: unit.trim(), residentType },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Join {communityName}</h2>
        <p className="text-sm text-content-secondary mt-1">
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
          Unit identifier <span className="text-status-danger">*</span>
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
          I am a(n) <span className="text-status-danger">*</span>
        </label>
        <select
          id="resident-type"
          className="flex h-10 w-full rounded-md border border-edge bg-surface-card px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {submit.isPending ? 'Submitting…' : 'Submit Request'}
        </Button>
      </div>
    </div>
  );
}
