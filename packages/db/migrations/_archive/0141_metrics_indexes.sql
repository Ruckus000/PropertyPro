-- Indexes to support metrics queries on communities.
-- Partial indexes keep them small: only non-demo, live communities by created_at;
-- only canceled subs for churn queries.

CREATE INDEX IF NOT EXISTS idx_communities_created_at_real
  ON communities (created_at)
  WHERE is_demo = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_communities_canceled_at
  ON communities (subscription_canceled_at)
  WHERE subscription_canceled_at IS NOT NULL;
