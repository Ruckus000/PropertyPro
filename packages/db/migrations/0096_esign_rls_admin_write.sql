-- Migration 0096: Harden e-sign RLS policies with admin-gated writes.
--
-- The original 0090 migration applied generic pp_tenant_* policies
-- that only check community membership for all operations.
-- This migration replaces INSERT/UPDATE/DELETE policies on write-protected
-- e-sign tables to require admin-tier role (manager/pm_admin).
-- esign_events gets append-only treatment (no UPDATE/DELETE).
-- esign_consent gets user-scoped treatment (users manage their own).

-- ---------------------------------------------------------------------------
-- 1. Admin-write tables: esign_templates, esign_submissions, esign_signers
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'esign_templates',
      'esign_submissions',
      'esign_signers'
    ]::text[])
  LOOP
    -- Replace INSERT policy: require admin-tier role
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_insert" ON "public".%I', t);
    EXECUTE format(
      'CREATE POLICY "pp_esign_admin_insert" ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"))',
      t
    );

    -- Replace UPDATE policy: require admin-tier role
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_update" ON "public".%I', t);
    EXECUTE format(
      'CREATE POLICY "pp_esign_admin_update" ON "public".%I FOR UPDATE USING ("public"."pp_rls_can_read_audit_log"("community_id")) WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"))',
      t
    );

    -- Replace DELETE policy: require admin-tier role
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_delete" ON "public".%I', t);
    EXECUTE format(
      'CREATE POLICY "pp_esign_admin_delete" ON "public".%I FOR DELETE USING ("public"."pp_rls_can_read_audit_log"("community_id"))',
      t
    );

    -- SELECT remains community-membership (unchanged from 0090)
  END LOOP;
END $$;

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Append-only table: esign_events
--    INSERT allowed for admin-tier; UPDATE and DELETE blocked entirely.
-- ---------------------------------------------------------------------------

-- Replace INSERT with admin-gated
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."esign_events";
CREATE POLICY "pp_esign_events_admin_insert" ON "public"."esign_events"
  FOR INSERT WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));

-- Drop UPDATE/DELETE entirely (append-only)
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."esign_events";
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."esign_events";

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. User-scoped table: esign_consent
--    Users can INSERT/UPDATE their own consent; admin-tier can manage all.
-- ---------------------------------------------------------------------------

-- Replace INSERT: user can insert own consent, admin can insert any
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."esign_consent";
CREATE POLICY "pp_esign_consent_insert" ON "public"."esign_consent"
  FOR INSERT WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
    AND (user_id = auth.uid() OR "public"."pp_rls_can_read_audit_log"("community_id"))
  );

-- Replace UPDATE: user can update own consent, admin can update any
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."esign_consent";
CREATE POLICY "pp_esign_consent_update" ON "public"."esign_consent"
  FOR UPDATE
  USING (
    "public"."pp_rls_can_access_community"("community_id")
    AND (user_id = auth.uid() OR "public"."pp_rls_can_read_audit_log"("community_id"))
  )
  WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
    AND (user_id = auth.uid() OR "public"."pp_rls_can_read_audit_log"("community_id"))
  );

-- Replace DELETE: only admin can delete consent records
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."esign_consent";
CREATE POLICY "pp_esign_consent_admin_delete" ON "public"."esign_consent"
  FOR DELETE USING ("public"."pp_rls_can_read_audit_log"("community_id"));
