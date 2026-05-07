-- Forward repair for databases that have the 0096 journal slot marked but
-- still retain the generic e-sign pp_tenant_* write policies.

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'esign_templates',
      'esign_submissions',
      'esign_signers'
    ]::text[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_insert" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_update" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_delete" ON "public".%I', table_name);

    EXECUTE format('DROP POLICY IF EXISTS "pp_esign_admin_insert" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_esign_admin_update" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_esign_admin_delete" ON "public".%I', table_name);

    EXECUTE format(
      'CREATE POLICY "pp_esign_admin_insert" ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_esign_admin_update" ON "public".%I FOR UPDATE USING ("public"."pp_rls_can_read_audit_log"("community_id")) WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_esign_admin_delete" ON "public".%I FOR DELETE USING ("public"."pp_rls_can_read_audit_log"("community_id"))',
      table_name
    );
  END LOOP;
END $$;

--> statement-breakpoint

DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."esign_events";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."esign_events";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."esign_events";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_esign_events_admin_insert" ON "public"."esign_events";
--> statement-breakpoint
CREATE POLICY "pp_esign_events_admin_insert" ON "public"."esign_events"
  FOR INSERT WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));

--> statement-breakpoint

DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."esign_consent";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."esign_consent";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."esign_consent";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_esign_consent_insert" ON "public"."esign_consent";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_esign_consent_update" ON "public"."esign_consent";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_esign_consent_admin_delete" ON "public"."esign_consent";
--> statement-breakpoint

CREATE POLICY "pp_esign_consent_insert" ON "public"."esign_consent"
  FOR INSERT WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
    AND ("user_id" = auth.uid() OR "public"."pp_rls_can_read_audit_log"("community_id"))
  );
--> statement-breakpoint

CREATE POLICY "pp_esign_consent_update" ON "public"."esign_consent"
  FOR UPDATE
  USING (
    "public"."pp_rls_can_access_community"("community_id")
    AND ("user_id" = auth.uid() OR "public"."pp_rls_can_read_audit_log"("community_id"))
  )
  WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
    AND ("user_id" = auth.uid() OR "public"."pp_rls_can_read_audit_log"("community_id"))
  );
--> statement-breakpoint

CREATE POLICY "pp_esign_consent_admin_delete" ON "public"."esign_consent"
  FOR DELETE USING ("public"."pp_rls_can_read_audit_log"("community_id"));
