-- Migration 0120: stripe_prices table
-- Global billing configuration table. Replaces STRIPE_PRICE_* env vars.
-- One row per (plan_id, community_type, billing_interval) combination.

CREATE TABLE stripe_prices (
  id bigserial PRIMARY KEY,
  plan_id text NOT NULL
    CHECK (plan_id IN ('essentials', 'professional', 'operations_plus')),
  community_type text NOT NULL
    CHECK (community_type IN ('condo_718', 'hoa_720', 'apartment')),
  billing_interval text NOT NULL
    CHECK (billing_interval IN ('month')),
  stripe_price_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, community_type, billing_interval)
);

-- RLS: Global table — service_role only, no anon/authenticated access.
ALTER TABLE stripe_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_prices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON stripe_prices FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON stripe_prices TO service_role;

-- Seed initial rows for all valid (plan_id, community_type, billing_interval) combinations.
-- IMPORTANT: Replace 'price_placeholder_*' values with real Stripe Price IDs before deploying.
-- Use the readiness endpoint GET /api/v1/internal/readiness to validate completeness.
INSERT INTO stripe_prices (plan_id, community_type, billing_interval, stripe_price_id) VALUES
  ('essentials',      'condo_718', 'month', 'price_placeholder_essentials_condo'),
  ('essentials',      'hoa_720',   'month', 'price_placeholder_essentials_hoa'),
  ('professional',    'condo_718', 'month', 'price_placeholder_professional_condo'),
  ('professional',    'hoa_720',   'month', 'price_placeholder_professional_hoa'),
  ('operations_plus', 'apartment', 'month', 'price_placeholder_operations_plus_apartment');
