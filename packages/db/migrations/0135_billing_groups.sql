CREATE TABLE billing_groups (
  id                     bigserial PRIMARY KEY,
  name                   text NOT NULL,
  stripe_customer_id     text UNIQUE NOT NULL,
  owner_user_id          uuid NOT NULL REFERENCES users(id),
  volume_tier            text NOT NULL DEFAULT 'none'
                           CHECK (volume_tier IN ('none', 'tier_10', 'tier_15', 'tier_20')),
  active_community_count integer NOT NULL DEFAULT 0,
  coupon_sync_status     text NOT NULL DEFAULT 'synced'
                           CHECK (coupon_sync_status IN ('synced', 'pending', 'failed')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

COMMENT ON COLUMN billing_groups.active_community_count IS
  'Denormalized count maintained by recalculateVolumeTier(). Do not write directly — call recalculateVolumeTier(billingGroupId) to refresh.';

CREATE INDEX idx_billing_groups_owner ON billing_groups(owner_user_id);

ALTER TABLE communities ADD COLUMN billing_group_id bigint
  REFERENCES billing_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_communities_billing_group ON communities(billing_group_id);

-- RLS: billing_groups are owner-scoped, not community-scoped
ALTER TABLE billing_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_groups_owner_read ON billing_groups
  FOR SELECT USING (owner_user_id = auth.uid());

-- Writes only via service role (server code)
CREATE POLICY billing_groups_service_write ON billing_groups
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
