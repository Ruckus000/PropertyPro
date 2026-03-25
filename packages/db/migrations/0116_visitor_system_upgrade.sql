-- 0116_visitor_system_upgrade.sql
-- Visitor system upgrade: guest types, vehicle tracking, denied-entry list, auto-checkout

-- 1. Add new columns to visitor_log
ALTER TABLE visitor_log ADD COLUMN guest_type TEXT NOT NULL DEFAULT 'one_time';
ALTER TABLE visitor_log ADD COLUMN valid_from TIMESTAMP WITH TIME ZONE;
ALTER TABLE visitor_log ADD COLUMN valid_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE visitor_log ADD COLUMN recurrence_rule TEXT;
ALTER TABLE visitor_log ADD COLUMN expected_duration_minutes INTEGER;
ALTER TABLE visitor_log ADD COLUMN vehicle_make TEXT;
ALTER TABLE visitor_log ADD COLUMN vehicle_model TEXT;
ALTER TABLE visitor_log ADD COLUMN vehicle_color TEXT;
ALTER TABLE visitor_log ADD COLUMN vehicle_plate TEXT;
ALTER TABLE visitor_log ADD COLUMN revoked_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE visitor_log ADD COLUMN revoked_at TIMESTAMP WITH TIME ZONE;

-- 2. CHECK constraints
ALTER TABLE visitor_log ADD CONSTRAINT chk_visitor_guest_type
  CHECK (guest_type IN ('one_time', 'recurring', 'permanent', 'vendor'));
ALTER TABLE visitor_log ADD CONSTRAINT chk_visitor_recurrence_rule
  CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('weekdays', 'weekends', 'mon_wed_fri', 'tue_thu', 'custom'));
ALTER TABLE visitor_log ADD CONSTRAINT chk_visitor_duration
  CHECK (expected_duration_minutes IS NULL OR (expected_duration_minutes >= 15 AND expected_duration_minutes <= 1440));

-- 3. New indexes
CREATE INDEX idx_visitor_log_guest_type ON visitor_log (community_id, guest_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_visitor_log_auto_checkout ON visitor_log (checked_in_at, expected_duration_minutes)
  WHERE checked_out_at IS NULL AND deleted_at IS NULL AND expected_duration_minutes IS NOT NULL;

-- 4. Create denied_visitors table
CREATE TABLE IF NOT EXISTS denied_visitors (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  denied_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_plate TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_denied_visitors_community ON denied_visitors (community_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_denied_visitors_active ON denied_visitors (community_id, is_active) WHERE deleted_at IS NULL;

-- 5. RLS for denied_visitors
ALTER TABLE denied_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE denied_visitors FORCE ROW LEVEL SECURITY;

REVOKE ALL ON denied_visitors FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON denied_visitors TO service_role;
GRANT USAGE, SELECT ON SEQUENCE denied_visitors_id_seq TO service_role;

CREATE POLICY denied_visitors_select ON denied_visitors
  FOR SELECT USING (pp_rls_can_access_community(community_id));

CREATE POLICY denied_visitors_insert ON denied_visitors
  FOR INSERT WITH CHECK (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  );

CREATE POLICY denied_visitors_update ON denied_visitors
  FOR UPDATE USING (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  ) WITH CHECK (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  );

CREATE POLICY denied_visitors_delete ON denied_visitors
  FOR DELETE USING (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  );

-- 6. Write-scope trigger
CREATE TRIGGER enforce_denied_visitors_community_scope
  BEFORE INSERT OR UPDATE ON denied_visitors
  FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
