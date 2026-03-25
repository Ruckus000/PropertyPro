-- Super Admin Support Access: sessions, consent, and audit log

-- Enum for access levels
DO $$ BEGIN
  CREATE TYPE support_access_level AS ENUM ('read_only', 'read_write');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Support Sessions (platform-scoped, not tenant-scoped)
CREATE TABLE support_sessions (
  id              bigserial PRIMARY KEY,
  admin_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id    bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  ticket_id       text,
  access_level    support_access_level NOT NULL DEFAULT 'read_only',
  started_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  ended_reason    text CHECK (ended_reason IN ('manual', 'expired', 'consent_revoked')),
  consent_id      bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_sessions_admin ON support_sessions(admin_user_id);
CREATE INDEX idx_support_sessions_community ON support_sessions(community_id);
CREATE INDEX idx_support_sessions_active ON support_sessions(admin_user_id)
  WHERE ended_at IS NULL;

ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY support_sessions_service_bypass ON support_sessions
  FOR ALL USING (pp_rls_is_privileged());

-- 2. Support Consent Grants (one active per community)
CREATE TABLE support_consent_grants (
  id              bigserial PRIMARY KEY,
  community_id    bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  granted_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  access_level    text NOT NULL DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'read_write')),
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE UNIQUE INDEX idx_consent_active_community ON support_consent_grants(community_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_consent_community ON support_consent_grants(community_id);

ALTER TABLE support_consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_consent_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY consent_service_bypass ON support_consent_grants
  FOR ALL USING (pp_rls_is_privileged());

CREATE POLICY consent_community_read ON support_consent_grants
  FOR SELECT USING (pp_rls_can_access_community(community_id));

-- 3. Support Access Log (append-only audit trail)
CREATE TABLE support_access_log (
  id              bigserial PRIMARY KEY,
  admin_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id    bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  session_id      bigint REFERENCES support_sessions(id) ON DELETE SET NULL,
  event           text NOT NULL,
  resource_type   text,
  resource_id     text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_support_access_log_community ON support_access_log(community_id);
CREATE INDEX idx_support_access_log_admin ON support_access_log(admin_user_id);
CREATE INDEX idx_support_access_log_session ON support_access_log(session_id);

ALTER TABLE support_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_access_log FORCE ROW LEVEL SECURITY;

CREATE POLICY access_log_service_bypass ON support_access_log
  FOR ALL USING (pp_rls_is_privileged());

CREATE POLICY access_log_community_read ON support_access_log
  FOR SELECT USING (pp_rls_can_access_community(community_id));

-- Append-only guard: prevent UPDATE/DELETE on access log
CREATE OR REPLACE FUNCTION prevent_support_access_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'support_access_log is append-only'
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_access_log_append_only_guard
  BEFORE UPDATE OR DELETE ON support_access_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_support_access_log_mutation();

-- FK from sessions to consent
ALTER TABLE support_sessions
  ADD CONSTRAINT fk_support_sessions_consent
  FOREIGN KEY (consent_id) REFERENCES support_consent_grants(id) ON DELETE SET NULL;
