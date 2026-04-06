-- Lock in unit_amount_cents as NOT NULL after Task 5 backfill.
-- Safe if backfill populated all rows; errors otherwise (which is what we want).

ALTER TABLE stripe_prices
  ALTER COLUMN unit_amount_cents SET NOT NULL;
