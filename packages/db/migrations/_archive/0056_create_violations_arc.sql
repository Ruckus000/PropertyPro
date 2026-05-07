-- WS-67: Violations and ARC core schema.

CREATE TABLE violations (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES units(id),
  reported_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reported',
  severity TEXT NOT NULL DEFAULT 'minor',
  evidence_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  notice_date DATE,
  hearing_date TIMESTAMPTZ,
  resolution_date TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT violations_status_check CHECK (
    status IN ('reported', 'noticed', 'hearing_scheduled', 'fined', 'resolved', 'dismissed')
  ),
  CONSTRAINT violations_severity_check CHECK (
    severity IN ('minor', 'moderate', 'major')
  ),
  CONSTRAINT violations_evidence_document_ids_is_array CHECK (jsonb_typeof(evidence_document_ids) = 'array')
);

ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations FORCE ROW LEVEL SECURITY;

CREATE TABLE violation_fines (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  violation_id BIGINT NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  waived_at TIMESTAMPTZ,
  waived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT violation_fines_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT violation_fines_status_check CHECK (
    status IN ('pending', 'paid', 'waived')
  )
);

ALTER TABLE violation_fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_fines FORCE ROW LEVEL SECURITY;

CREATE TABLE arc_submissions (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES units(id),
  submitted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  project_type TEXT NOT NULL,
  estimated_start_date DATE,
  estimated_completion_date DATE,
  attachment_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'submitted',
  review_notes TEXT,
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT arc_submissions_status_check CHECK (
    status IN ('submitted', 'under_review', 'approved', 'denied', 'withdrawn')
  ),
  CONSTRAINT arc_submissions_attachment_ids_is_array CHECK (jsonb_typeof(attachment_document_ids) = 'array')
);

ALTER TABLE arc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_submissions FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'violations',
      'violation_fines',
      'arc_submissions'
    ]::text[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_select" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_insert" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_update" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_delete" ON "public".%I', table_name);

    EXECUTE format(
      'CREATE POLICY "pp_tenant_select" ON "public".%I FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_insert" ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_update" ON "public".%I FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id")) WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_delete" ON "public".%I FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );

    EXECUTE format('DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public".%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER "pp_rls_enforce_tenant_scope" BEFORE INSERT OR UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"()',
      table_name
    );
  END LOOP;
END $$;

CREATE INDEX idx_violations_community_status
  ON violations(community_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_violations_community_unit
  ON violations(community_id, unit_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_violation_fines_community_status
  ON violation_fines(community_id, status, issued_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_violation_fines_violation
  ON violation_fines(community_id, violation_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_arc_submissions_community_status
  ON arc_submissions(community_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_arc_submissions_community_unit
  ON arc_submissions(community_id, unit_id, created_at DESC)
  WHERE deleted_at IS NULL;
