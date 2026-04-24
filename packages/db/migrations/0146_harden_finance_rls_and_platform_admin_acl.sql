-- Repair RLS policy-family drift for finance-owned tables and restore the
-- platform admin ACL contract.
--
-- RLS_TENANT_TABLES marks the finance tables below as tenant_admin_write, but
-- their original migrations left generic pp_tenant_insert/update/delete
-- policies in place. Keep tenant-scoped SELECT and require admin-tier actors
-- for writes, matching the route-layer authorization contract.

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'assessments',
      'assessment_line_items',
      'ledger_entries',
      'stripe_connected_accounts'
    ]::text[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_insert" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_update" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_delete" ON "public".%I', table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON "public".%I', 'pp_' || table_name || '_insert', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON "public".%I', 'pp_' || table_name || '_update', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON "public".%I', 'pp_' || table_name || '_delete', table_name);

    EXECUTE format(
      'CREATE POLICY %I ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"))',
      'pp_' || table_name || '_insert',
      table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON "public".%I FOR UPDATE USING ("public"."pp_rls_can_read_audit_log"("community_id")) WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"))',
      'pp_' || table_name || '_update',
      table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON "public".%I FOR DELETE USING ("public"."pp_rls_can_read_audit_log"("community_id"))',
      'pp_' || table_name || '_delete',
      table_name
    );
  END LOOP;
END $$;

--> statement-breakpoint

ALTER TABLE "public"."platform_admin_users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."platform_admin_users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."platform_admin_users" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."platform_admin_users" TO service_role;
