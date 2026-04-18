-- Lock in unit_amount_cents as NOT NULL after Task 5 backfill.
-- Safe if backfill populated all rows; errors otherwise (which is what we want).

UPDATE stripe_prices
SET unit_amount_cents = CASE plan_id
  WHEN 'essentials' THEN 19900
  WHEN 'professional' THEN 34900
  WHEN 'operations_plus' THEN 49900
  ELSE unit_amount_cents
END
WHERE unit_amount_cents IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM stripe_prices
    WHERE unit_amount_cents IS NULL
  ) THEN
    RAISE EXCEPTION 'stripe_prices.unit_amount_cents bootstrap backfill left null values';
  END IF;
END $$;

ALTER TABLE stripe_prices
  ALTER COLUMN unit_amount_cents SET NOT NULL;
