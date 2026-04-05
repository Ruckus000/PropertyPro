-- Append-only daily revenue snapshots. Platform-wide (not tenant-scoped).
-- Query with DISTINCT ON (snapshot_date) ORDER BY snapshot_date DESC, computed_at DESC
-- to fetch the latest row per day.

CREATE TABLE revenue_snapshots (
  id bigserial PRIMARY KEY,
  snapshot_date date NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  mrr_cents bigint NOT NULL,
  potential_mrr_cents bigint NOT NULL,
  active_subscriptions int NOT NULL,
  trialing_subscriptions int NOT NULL,
  past_due_subscriptions int NOT NULL,
  by_plan jsonb NOT NULL,
  by_community_type jsonb NOT NULL,
  volume_discount_savings_cents bigint NOT NULL DEFAULT 0,
  free_access_cost_cents bigint NOT NULL DEFAULT 0,
  prices_version text NOT NULL,
  reconciliation_drift_pct numeric(5,2),
  communities_skipped int NOT NULL DEFAULT 0,
  mrr_delta_pct numeric(6,2)
);

CREATE INDEX idx_revenue_snapshots_date_computed
  ON revenue_snapshots (snapshot_date DESC, computed_at DESC);

-- Platform-wide table. Same access pattern as stripe_prices: service_role only.
ALTER TABLE revenue_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON revenue_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT ON revenue_snapshots TO service_role;
GRANT USAGE ON SEQUENCE revenue_snapshots_id_seq TO service_role;
