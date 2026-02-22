-- P4-55: Row-Level Security baseline for tenant-scoped tables.
-- Defense in depth complement to the scoped query builder (AGENTS #13/#14).
--
-- Scope:
-- - Enable RLS on all tenant-scoped tables (21 current tables)
-- - Add reusable helper functions for tenant membership and audit-log access checks
-- - Add generic tenant community_id auto-scope trigger for tenant CRUD tables
-- - Preserve privileged/service-role access for migrations/background jobs

CREATE OR REPLACE FUNCTION "public"."pp_rls_effective_role"()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    session_user
  )::text;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."pp_rls_is_privileged"()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT "public"."pp_rls_effective_role"() IN ('postgres', 'service_role', 'supabase_admin');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."pp_rls_active_community_id"()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_community_id', true), '')::bigint;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."pp_rls_has_community_membership"(target_community_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid()
        AND ur.community_id = target_community_id
    )
  END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."pp_rls_can_access_community"(target_community_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT "public"."pp_rls_has_community_membership"(target_community_id);
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."pp_rls_can_read_audit_log"(target_community_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid()
        AND ur.community_id = target_community_id
        AND ur.role IN (
          'board_member',
          'board_president',
          'cam',
          'site_manager',
          'property_manager_admin'
        )
    )
  END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."pp_rls_enforce_tenant_community_id"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_community_id bigint;
BEGIN
  -- Privileged jobs and migrations may write across tenants intentionally.
  IF "public"."pp_rls_is_privileged"() THEN
    RETURN NEW;
  END IF;

  active_community_id := "public"."pp_rls_active_community_id"();
  IF active_community_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant DB session context: app.current_community_id'
      USING ERRCODE = '42501';
  END IF;

  NEW.community_id := active_community_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  -- Tenant CRUD tables: community members can operate only within their communities.
  FOR table_name IN
    SELECT unnest(ARRAY[
      'announcements',
      'compliance_checklist_items',
      'contract_bids',
      'contracts',
      'document_categories',
      'documents',
      'invitations',
      'leases',
      'maintenance_comments',
      'maintenance_requests',
      'meeting_documents',
      'meetings',
      'notification_preferences',
      'onboarding_wizard_state',
      'units',
      'user_roles'
    ]::text[])
  LOOP
    EXECUTE format('ALTER TABLE "public".%I ENABLE ROW LEVEL SECURITY', table_name);

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

  -- Service-only/system-managed tenant tables.
  FOR table_name IN
    SELECT unnest(ARRAY[
      'announcement_delivery_log',
      'demo_seed_registry',
      'notification_digest_queue',
      'provisioning_jobs'
    ]::text[])
  LOOP
    EXECUTE format('ALTER TABLE "public".%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format('DROP POLICY IF EXISTS "pp_service_select" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_service_insert" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_service_update" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_service_delete" ON "public".%I', table_name);

    EXECUTE format(
      'CREATE POLICY "pp_service_select" ON "public".%I FOR SELECT USING ("public"."pp_rls_is_privileged"())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_service_insert" ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_is_privileged"())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_service_update" ON "public".%I FOR UPDATE USING ("public"."pp_rls_is_privileged"()) WITH CHECK ("public"."pp_rls_is_privileged"())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_service_delete" ON "public".%I FOR DELETE USING ("public"."pp_rls_is_privileged"())',
      table_name
    );
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE "public"."compliance_audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "pp_audit_select" ON "public"."compliance_audit_log";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_audit_insert" ON "public"."compliance_audit_log";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_audit_update" ON "public"."compliance_audit_log";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_audit_delete" ON "public"."compliance_audit_log";
--> statement-breakpoint

CREATE POLICY "pp_audit_select"
ON "public"."compliance_audit_log"
FOR SELECT
USING ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_audit_insert"
ON "public"."compliance_audit_log"
FOR INSERT
WITH CHECK ("public"."pp_rls_is_privileged"());
--> statement-breakpoint

-- Rollback (manual):
-- - DROP POLICY ... on affected tables
-- - ALTER TABLE ... DISABLE ROW LEVEL SECURITY (if full rollback is required)
-- - DROP TRIGGER pp_rls_enforce_tenant_scope on tenant CRUD tables
-- - DROP FUNCTION pp_rls_enforce_tenant_community_id / pp_rls_* helpers
