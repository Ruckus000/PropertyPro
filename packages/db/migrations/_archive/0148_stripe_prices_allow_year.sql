-- Migration 0148: support self-service plan changes
--
-- Two changes bundled because both are required by the same in-app
-- plan-change feature:
--
--   1. Allow billing_interval='year' on stripe_prices, so subscribers can
--      switch to annual billing. Annual price rows are seeded per environment
--      (sandbox + prod) after corresponding Prices are created in Stripe.
--   2. Allow event_type='self_service_plan_changed' on conversion_events,
--      so the upgrade endpoint can record completed plan switches in the
--      conversion funnel.

-- 1. stripe_prices.billing_interval — add 'year'
ALTER TABLE stripe_prices DROP CONSTRAINT IF EXISTS stripe_prices_billing_interval_check;
ALTER TABLE stripe_prices ADD CONSTRAINT stripe_prices_billing_interval_check
  CHECK (billing_interval IN ('month', 'year'));

-- 2. conversion_events.event_type — add 'self_service_plan_changed'
ALTER TABLE conversion_events DROP CONSTRAINT IF EXISTS conversion_events_event_type_check;
ALTER TABLE conversion_events ADD CONSTRAINT conversion_events_event_type_check
  CHECK (event_type IN (
    'demo_created',
    'demo_entered',
    'conversion_initiated',
    'checkout_completed',
    'checkout_session_expired',
    'founding_user_created',
    'grace_started',
    'demo_soft_deleted',
    'self_service_upgrade_started',
    'self_service_plan_changed'
  ));
