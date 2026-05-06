-- P2-34 follow-up: Constrain subscription_status to known Stripe + custom values.
-- Applied manually and reconciled into drizzle-kit migration metadata.
-- Prevents unexpected values (e.g., 'incomplete_expired') from silently passing the
-- subscription guard's Set-based check in apps/web/src/lib/middleware/subscription-guard.ts.
ALTER TABLE communities
  ADD CONSTRAINT communities_subscription_status_check
  CHECK (
    subscription_status IS NULL OR subscription_status IN (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused',
      'expired'
    )
  );
