-- Denormalize unit_amount_cents onto stripe_prices so revenue snapshots can
-- compute MRR without calling Stripe on every run.
-- Nullable until backfill (Task 5) populates it; Task 6 sets NOT NULL.

ALTER TABLE stripe_prices
  ADD COLUMN unit_amount_cents bigint;
