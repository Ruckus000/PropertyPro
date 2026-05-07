-- 0136_community_join_requests.sql
-- Self-service community linking: users search for a community, submit a join request
-- (with unit identifier + owner/tenant), admins approve/deny, approvals create user_roles rows.

CREATE TABLE IF NOT EXISTS "community_join_requests" (
  "id"              bigserial PRIMARY KEY,
  "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "community_id"    bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "unit_identifier" text NOT NULL,
  "resident_type"   text NOT NULL CHECK ("resident_type" IN ('owner', 'tenant')),
  "status"          text NOT NULL DEFAULT 'pending'
                      CHECK ("status" IN ('pending', 'approved', 'denied', 'withdrawn')),
  "reviewed_by"     uuid REFERENCES "users"("id"),
  "reviewed_at"     timestamp with time zone,
  "review_notes"    text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"      timestamp with time zone
);

-- Only one pending request per (user, community) at a time
CREATE UNIQUE INDEX idx_join_requests_unique_pending
  ON community_join_requests(user_id, community_id)
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX idx_join_requests_community_status
  ON community_join_requests(community_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_join_requests_user
  ON community_join_requests(user_id)
  WHERE deleted_at IS NULL;

-- RLS: community-scoped isolation via app.community_id GUC (standard PropertyPro pattern)
ALTER TABLE community_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_join_requests FORCE ROW LEVEL SECURITY;

-- Tenant-scoped policies (enforced by scoped client's community_id setting)
CREATE POLICY "community_join_requests_tenant_insert"
  ON community_join_requests FOR INSERT
  WITH CHECK (community_id = current_setting('app.community_id', true)::bigint);

CREATE POLICY "community_join_requests_tenant_select"
  ON community_join_requests FOR SELECT
  USING (community_id = current_setting('app.community_id', true)::bigint);

CREATE POLICY "community_join_requests_tenant_update"
  ON community_join_requests FOR UPDATE
  USING (community_id = current_setting('app.community_id', true)::bigint);

-- Write-scope trigger: tenant isolation enforcement at DB layer
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_community_write_scope') THEN
    CREATE TRIGGER enforce_community_scope
      BEFORE INSERT OR UPDATE ON community_join_requests
      FOR EACH ROW EXECUTE FUNCTION enforce_community_write_scope();
  END IF;
END $$;
