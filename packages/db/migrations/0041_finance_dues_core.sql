-- WS-66: Finance / dues data model core.

CREATE TABLE assessments (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount_cents BIGINT NOT NULL,
  frequency TEXT NOT NULL,
  due_day INT,
  late_fee_amount_cents BIGINT NOT NULL DEFAULT 0,
  late_fee_days_grace INT NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT assessments_frequency_check CHECK (
    frequency IN ('monthly', 'quarterly', 'annual', 'one_time')
  ),
  CONSTRAINT assessments_due_day_check CHECK (
    due_day IS NULL OR (due_day >= 1 AND due_day <= 31)
  )
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;

CREATE TABLE assessment_line_items (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT REFERENCES assessments(id) ON DELETE SET NULL,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  payment_intent_id TEXT,
  late_fee_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT assessment_line_items_status_check CHECK (
    status IN ('pending', 'paid', 'overdue', 'waived')
  )
);

ALTER TABLE assessment_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_line_items FORCE ROW LEVEL SECURITY;

CREATE TABLE stripe_connected_accounts (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL UNIQUE REFERENCES communities(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE stripe_connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_connected_accounts FORCE ROW LEVEL SECURITY;

CREATE TABLE finance_stripe_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_stripe_webhook_events FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'assessments',
      'assessment_line_items',
      'stripe_connected_accounts'
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

DROP POLICY IF EXISTS "pp_finance_webhook_select" ON finance_stripe_webhook_events;
DROP POLICY IF EXISTS "pp_finance_webhook_insert" ON finance_stripe_webhook_events;
DROP POLICY IF EXISTS "pp_finance_webhook_update" ON finance_stripe_webhook_events;
DROP POLICY IF EXISTS "pp_finance_webhook_delete" ON finance_stripe_webhook_events;

CREATE POLICY "pp_finance_webhook_select"
ON finance_stripe_webhook_events
FOR SELECT
USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_finance_webhook_insert"
ON finance_stripe_webhook_events
FOR INSERT
WITH CHECK ("public"."pp_rls_can_access_community"(community_id));

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON finance_stripe_webhook_events;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT ON finance_stripe_webhook_events
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

CREATE INDEX idx_assessments_community_active
  ON assessments(community_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_assessment_line_items_community_status_due
  ON assessment_line_items(community_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_assessment_line_items_unit_due
  ON assessment_line_items(community_id, unit_id, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_finance_webhooks_community_processed
  ON finance_stripe_webhook_events(community_id, processed_at DESC);
