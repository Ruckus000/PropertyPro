-- FAQs table and community contact columns for mobile help & settings pages.

-- 1. Create faqs table
CREATE TABLE faqs (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Index for community lookup (no unique index on sort_order — reorder is best-effort)
CREATE INDEX idx_faqs_community ON faqs(community_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs FORCE ROW LEVEL SECURITY;

CREATE POLICY faqs_service_bypass ON faqs
  FOR ALL
  USING (pp_rls_is_privileged());

CREATE POLICY faqs_community_read ON faqs
  FOR SELECT
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY faqs_community_insert ON faqs
  FOR INSERT
  WITH CHECK (pp_rls_can_access_community(community_id));

CREATE POLICY faqs_community_update ON faqs
  FOR UPDATE
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY faqs_community_delete ON faqs
  FOR DELETE
  USING (pp_rls_can_access_community(community_id));

-- Tenant scope trigger (blocks unscoped mutations)
CREATE TRIGGER faqs_tenant_scope
  BEFORE INSERT OR UPDATE ON faqs
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

-- 2. Add contact columns to communities
ALTER TABLE communities
  ADD COLUMN contact_name  TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN contact_phone TEXT;
