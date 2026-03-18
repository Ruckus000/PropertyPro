/**
 * Payment fee calculation for Stripe Connect convenience fees.
 *
 * Two modes:
 * - owner_pays: Convenience fee added to the owner's payment total.
 * - association_absorbs: No fee shown to owner; association's transfer is
 *   reduced by the estimated Stripe processing cost.
 *
 * Both modes set `application_fee_amount` on the PaymentIntent so the
 * platform does not absorb Stripe's processing fees.
 */

export type PaymentFeePolicy = 'owner_pays' | 'association_absorbs';

/** Backward-compatible default: existing communities keep current behavior. */
export const DEFAULT_FEE_POLICY: PaymentFeePolicy = 'association_absorbs';

// ── Stripe rate constants ──────────────────────────────────────────────
export const CARD_RATE = 0.029;
export const CARD_FIXED_CENTS = 30;
export const ACH_RATE = 0.008;
export const ACH_CAP_CENTS = 500; // Stripe caps ACH fees at $5.00

/** Buffer granularity: round up to the nearest N cents. */
const BUFFER_CENTS = 5;

// ── Fee calculations ───────────────────────────────────────────────────

/**
 * Calculate the convenience fee charged to the owner (used in `owner_pays` mode).
 *
 * The formula accounts for Stripe charging on the *total* (assessment + fee)
 * by dividing by `(1 - rate)`. Without this, the platform loses money on
 * every transaction (e.g. ~$0.43 per $500 card payment).
 *
 * Result is rounded up to the nearest {@link BUFFER_CENTS} cents to absorb
 * AMEX / international card rate variance.
 */
export function calculateConvenienceFee(
  amountCents: number,
  method: 'card' | 'us_bank_account',
): number {
  if (amountCents <= 0) return 0;

  if (method === 'card') {
    const raw = (amountCents * CARD_RATE + CARD_FIXED_CENTS) / (1 - CARD_RATE);
    return Math.ceil(raw / BUFFER_CENTS) * BUFFER_CENTS;
  }

  // ACH: 0.8% capped at $5.00, adjusted for self-referential charge.
  // Cap at $5.25 to cover Stripe's $5.00 cap with buffer.
  const raw = (amountCents * ACH_RATE) / (1 - ACH_RATE);
  const capped = Math.min(raw, ACH_CAP_CENTS + BUFFER_CENTS); // $5.25
  return Math.ceil(capped / BUFFER_CENTS) * BUFFER_CENTS;
}

/**
 * Estimate the Stripe processing fee for a given charge amount and method
 * (used in `association_absorbs` mode to set `application_fee_amount`).
 *
 * This is the platform's best guess at what Stripe will actually charge.
 * Rounded up to nearest {@link BUFFER_CENTS} cents so the platform doesn't
 * lose money on rate variance.
 */
export function calculateStripeFeeEstimate(
  totalChargeCents: number,
  method: 'card' | 'us_bank_account',
): number {
  if (totalChargeCents <= 0) return 0;

  if (method === 'card') {
    const raw = totalChargeCents * CARD_RATE + CARD_FIXED_CENTS;
    return Math.ceil(raw / BUFFER_CENTS) * BUFFER_CENTS;
  }

  // ACH: 0.8% capped at $5.00
  const raw = Math.min(totalChargeCents * ACH_RATE, ACH_CAP_CENTS);
  return Math.ceil(raw / BUFFER_CENTS) * BUFFER_CENTS;
}
