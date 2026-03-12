-- WS-71: Package intake/pickup + visitor pass/check-in logging.

CREATE TABLE package_log (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  carrier TEXT NOT NULL,
  tracking_number TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  received_by_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
  picked_up_at TIMESTAMPTZ,
  picked_up_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT package_log_status_check CHECK (status IN ('received', 'notified', 'picked_up'))
);

ALTER TABLE package_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_tenant_select" ON package_log;
DROP POLICY IF EXISTS "pp_package_log_insert" ON package_log;
DROP POLICY IF EXISTS "pp_package_log_update" ON package_log;
DROP POLICY IF EXISTS "pp_package_log_delete" ON package_log;

CREATE POLICY "pp_tenant_select"
  ON package_log
  FOR SELECT
  USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_package_log_insert"
  ON package_log
  FOR INSERT
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_package_log_update"
  ON package_log
  FOR UPDATE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  )
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_package_log_delete"
  ON package_log
  FOR DELETE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON package_log;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON package_log
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

CREATE TABLE visitor_log (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  visitor_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  host_unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expected_arrival TIMESTAMPTZ NOT NULL,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  pass_code TEXT NOT NULL,
  staff_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT visitor_log_checkout_after_checkin CHECK (
    checked_out_at IS NULL OR checked_in_at IS NULL OR checked_out_at >= checked_in_at
  )
);

ALTER TABLE visitor_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_tenant_select" ON visitor_log;
DROP POLICY IF EXISTS "pp_visitor_log_insert" ON visitor_log;
DROP POLICY IF EXISTS "pp_visitor_log_update" ON visitor_log;
DROP POLICY IF EXISTS "pp_visitor_log_delete" ON visitor_log;

CREATE POLICY "pp_tenant_select"
  ON visitor_log
  FOR SELECT
  USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_visitor_log_insert"
  ON visitor_log
  FOR INSERT
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_visitor_log_update"
  ON visitor_log
  FOR UPDATE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  )
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_visitor_log_delete"
  ON visitor_log
  FOR DELETE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON visitor_log;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON visitor_log
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

CREATE INDEX idx_package_log_community_status
  ON package_log (community_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_package_log_community_unit
  ON package_log (community_id, unit_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_visitor_log_community_expected
  ON visitor_log (community_id, expected_arrival DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_visitor_log_community_host_unit
  ON visitor_log (community_id, host_unit_id, expected_arrival DESC)
  WHERE deleted_at IS NULL;
