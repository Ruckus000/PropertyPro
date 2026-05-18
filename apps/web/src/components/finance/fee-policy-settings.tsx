'use client';

import { useState } from 'react';
import { type PaymentFeePolicy, calculateConvenienceFee } from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useFeePolicy, useUpdateFeePolicy } from '@/hooks/use-fee-policy';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

// Sample calculation for a $500 assessment
const SAMPLE_AMOUNT_CENTS = 50_000;
const sampleCardFee = calculateConvenienceFee(SAMPLE_AMOUNT_CENTS, 'card');
const sampleAchFee = calculateConvenienceFee(SAMPLE_AMOUNT_CENTS, 'us_bank_account');

export function FeePolicySettings({ communityId }: { communityId: number }) {
  const [selectedPolicy, setSelectedPolicy] = useState<PaymentFeePolicy | null>(null);

  const { data: currentPolicy, isPending, isError } = useFeePolicy(communityId);

  const mutation = useUpdateFeePolicy(communityId);

  if (isPending) {
    return <div className="h-32 animate-pulse rounded-md bg-surface-muted" />;
  }

  if (isError) {
    return (
      <AlertBanner status="danger" title="Failed to load fee policy settings." />
    );
  }

  const displayPolicy = selectedPolicy ?? currentPolicy;
  const isDirty = selectedPolicy !== null && selectedPolicy !== currentPolicy;

  return (
    <div className="rounded-md border border-edge bg-surface-card p-6">
      <h3 className="text-base font-semibold text-content">Payment Fee Policy</h3>
      <p className="mt-1 text-sm text-content-secondary">
        Choose how online payment processing fees are handled for this community.
      </p>

      <div className="mt-4 space-y-3">
        {/* Owner Pays */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 ${
            displayPolicy === 'owner_pays'
              ? 'border-interactive bg-interactive-subtle'
              : 'border-edge hover:bg-surface-hover'
          }`}
        >
          <input
            type="radio"
            name="feePolicy"
            value="owner_pays"
            checked={displayPolicy === 'owner_pays'}
            onChange={() => setSelectedPolicy('owner_pays')}
            className="mt-0.5 h-4 w-4 text-interactive"
          />
          <div>
            <p className="text-sm font-medium text-content">
              Pass fees to unit owners
              <span className="ml-2 text-xs font-normal text-interactive">(recommended)</span>
            </p>
            <p className="mt-1 text-xs text-content-secondary">
              Owners pay a small convenience fee when paying online. The association receives
              100% of the assessment amount.
            </p>
            <p className="mt-1 text-xs text-content-tertiary">
              Example for a $500 assessment: Card fee ~{formatCents(sampleCardFee)},
              ACH fee ~{formatCents(sampleAchFee)}
            </p>
          </div>
        </label>

        {/* Association Absorbs */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 ${
            displayPolicy === 'association_absorbs'
              ? 'border-interactive bg-interactive-subtle'
              : 'border-edge hover:bg-surface-hover'
          }`}
        >
          <input
            type="radio"
            name="feePolicy"
            value="association_absorbs"
            checked={displayPolicy === 'association_absorbs'}
            onChange={() => setSelectedPolicy('association_absorbs')}
            className="mt-0.5 h-4 w-4 text-interactive"
          />
          <div>
            <p className="text-sm font-medium text-content">Association absorbs fees</p>
            <p className="mt-1 text-xs text-content-secondary">
              No fee shown to owners. The association&apos;s net collection is reduced by ~3% for
              card payments and ~0.8% for ACH.
            </p>
            <p className="mt-1 text-xs text-content-tertiary">
              For a $500/month assessment across 25 units paying by card, this costs the
              association ~$375/month.
            </p>
          </div>
        </label>
      </div>

      {isDirty && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setSelectedPolicy(null)}
            disabled={mutation.isPending}
            className="rounded-md border border-edge-strong bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              selectedPolicy &&
              mutation.mutate(selectedPolicy, {
                onSuccess: () => setSelectedPolicy(null),
              })
            }
            disabled={mutation.isPending}
            className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {mutation.isError && (
        <p className="mt-2 text-sm text-status-danger">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save'}
        </p>
      )}
    </div>
  );
}
