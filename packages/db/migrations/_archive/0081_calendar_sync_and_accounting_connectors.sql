-- WS-70: Calendar sync tokens + accounting connector credentials (adapter-first).

CREATE TABLE calendar_sync_tokens (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  sync_token TEXT,
  channel_id TEXT,
  channel_expiry TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT calendar_sync_tokens_provider_check CHECK (provider IN ('google')),
  CONSTRAINT calendar_sync_tokens_unique_connection UNIQUE (community_id, user_id, provider)
);

ALTER TABLE calendar_sync_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_tenant_select" ON calendar_sync_tokens;
DROP POLICY IF EXISTS "pp_calendar_sync_tokens_insert" ON calendar_sync_tokens;
DROP POLICY IF EXISTS "pp_calendar_sync_tokens_update" ON calendar_sync_tokens;
DROP POLICY IF EXISTS "pp_calendar_sync_tokens_delete" ON calendar_sync_tokens;

CREATE POLICY "pp_tenant_select"
  ON calendar_sync_tokens
  FOR SELECT
  USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_calendar_sync_tokens_insert"
  ON calendar_sync_tokens
  FOR INSERT
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_calendar_sync_tokens_update"
  ON calendar_sync_tokens
  FOR UPDATE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  )
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_calendar_sync_tokens_delete"
  ON calendar_sync_tokens
  FOR DELETE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON calendar_sync_tokens;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON calendar_sync_tokens
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

CREATE TABLE accounting_connections (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT accounting_connections_provider_check CHECK (provider IN ('quickbooks', 'xero')),
  CONSTRAINT accounting_connections_mapping_is_object CHECK (jsonb_typeof(mapping_config) = 'object'),
  CONSTRAINT accounting_connections_unique_provider UNIQUE (community_id, provider)
);

ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_tenant_select" ON accounting_connections;
DROP POLICY IF EXISTS "pp_accounting_connections_insert" ON accounting_connections;
DROP POLICY IF EXISTS "pp_accounting_connections_update" ON accounting_connections;
DROP POLICY IF EXISTS "pp_accounting_connections_delete" ON accounting_connections;

CREATE POLICY "pp_tenant_select"
  ON accounting_connections
  FOR SELECT
  USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_accounting_connections_insert"
  ON accounting_connections
  FOR INSERT
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_accounting_connections_update"
  ON accounting_connections
  FOR UPDATE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  )
  WITH CHECK (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

CREATE POLICY "pp_accounting_connections_delete"
  ON accounting_connections
  FOR DELETE
  USING (
    "public"."pp_rls_can_access_community"(community_id)
    AND ("public"."pp_rls_is_privileged"() OR "public"."pp_rls_can_read_audit_log"(community_id))
  );

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON accounting_connections;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON accounting_connections
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

CREATE INDEX idx_calendar_sync_tokens_community_user
  ON calendar_sync_tokens (community_id, user_id, provider)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_accounting_connections_community_provider
  ON accounting_connections (community_id, provider)
  WHERE deleted_at IS NULL;
