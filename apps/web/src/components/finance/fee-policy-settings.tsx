'use client';

import { AlertBanner } from '@/components/shared/alert-banner';
import { useFeePolicy } from '@/hooks/use-fee-policy';

/**
 * Payment fee policy — now a statement of fact, not a choice.
 *
 * ── What was removed, and why ──
 *
 * This was a two-option radio: pass processing fees to unit owners
 * (`owner_pays`), or absorb them (`association_absorbs`). The first option
 * charged the resident a fee computed at the card rate, and the PaymentIntent's
 * `payment_method_types` includes `'card'` — which includes DEBIT. Visa and
 * Mastercard rules prohibit surcharging debit outright, and they bind us
 * through the Stripe agreement, where the remedy is losing card acceptance
 * rather than a fine.
 *
 * The alternatives were to charge one uniform fee across every method
 * (compliant, but an ACH payer's fee on a $2,000 assessment goes from about $5
 * to about $60) or to detect the card's funding type and waive for debit (fair,
 * but funding type is not reliably known until the payment method is attached).
 * The owner retired the mode instead — associations absorb, which was already
 * the default for every community.
 *
 * So there is nothing left to choose, and the selection state, the dirty
 * tracking and the save mutation went with it. A radio group with one option is
 * a worse lie than a sentence.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-16.
 */
export function FeePolicySettings({ communityId }: { communityId: number }) {
  const { data: currentPolicy, isPending, isError } = useFeePolicy(communityId);

  if (isPending) {
    return <div className="h-32 animate-pulse rounded-md bg-surface-muted" />;
  }

  if (isError) {
    return <AlertBanner status="danger" title="Failed to load fee policy settings." />;
  }

  return (
    <div className="rounded-md border border-edge bg-surface-card p-6">
      <h3 className="text-base font-semibold text-content">Payment Fee Policy</h3>
      <p className="mt-1 text-sm text-content-secondary">
        How online payment processing fees are handled for this community.
      </p>

      {/*
        A community that had `owner_pays` stored still reads it back — the value
        is deliberately not deleted. Saying so plainly beats silently showing a
        different setting than the one they saved.
      */}
      {currentPolicy === 'owner_pays' && (
        <div className="mt-4">
          <AlertBanner
            status="warning"
            title="Your previous fee setting is no longer used"
            description={
              'This community was set to pass processing fees to unit owners. That option '
              + 'has been withdrawn: the fee was calculated at card rates and applied to '
              + 'debit cards too, which card-network rules do not permit. Payments now run '
              + 'with the association absorbing processing costs.'
            }
          />
        </div>
      )}

      <div className="mt-4 rounded-md border border-edge p-4">
        <p className="text-sm font-medium text-content">Association absorbs fees</p>
        <p className="mt-1 text-xs text-content-secondary">
          No fee is shown to owners. The association&apos;s net collection is reduced by
          ~3% for card payments and ~0.8% for ACH.
        </p>
        <p className="mt-1 text-xs text-content-tertiary">
          For a $500/month assessment across 25 units paying by card, this costs the
          association ~$375/month.
        </p>
      </div>
    </div>
  );
}
