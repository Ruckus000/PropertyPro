-- P4-55e: Elevate documents and invitations from tenant_crud to tenant_admin_write
-- policy family.
--
-- Finding (Gemini PR#14 Round 5): documents and invitations were assigned the generic
-- tenant_crud policy family in migration 0020, allowing any authenticated community
-- member to INSERT/UPDATE/DELETE at the DB level. Application routes already gate
-- writes to admin-tier roles via requireAdminRole, but RLS must enforce this as
-- defense-in-depth.
--
-- Tables elevated:
--   documents  — writes via requireAdminRole in document routes.
--   invitations — writes via requireAdminRole in invitations route.
--
-- SELECT policy (pp_tenant_select) is intentionally retained: any community member
-- may read documents and invitations within their community.
--
-- Policy naming convention: pp_{table_name}_insert/update/delete for bespoke
-- admin-write policies. Consistent with user_roles (0021), maintenance_comments (0022),
-- compliance_checklist_items, contract_bids, contracts (0023).

-- documents
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_documents_insert" ON "public"."documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_documents_update" ON "public"."documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_documents_delete" ON "public"."documents";
--> statement-breakpoint

CREATE POLICY "pp_documents_insert"
ON "public"."documents"
FOR INSERT
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_documents_update"
ON "public"."documents"
FOR UPDATE
USING ("public"."pp_rls_can_read_audit_log"("community_id"))
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_documents_delete"
ON "public"."documents"
FOR DELETE
USING ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

-- invitations
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."invitations";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."invitations";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."invitations";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_invitations_insert" ON "public"."invitations";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_invitations_update" ON "public"."invitations";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_invitations_delete" ON "public"."invitations";
--> statement-breakpoint

CREATE POLICY "pp_invitations_insert"
ON "public"."invitations"
FOR INSERT
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_invitations_update"
ON "public"."invitations"
FOR UPDATE
USING ("public"."pp_rls_can_read_audit_log"("community_id"))
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_invitations_delete"
ON "public"."invitations"
FOR DELETE
USING ("public"."pp_rls_can_read_audit_log"("community_id"));

-- Rollback (manual):
-- DROP POLICY IF EXISTS "pp_documents_insert" ON "public"."documents";
-- DROP POLICY IF EXISTS "pp_documents_update" ON "public"."documents";
-- DROP POLICY IF EXISTS "pp_documents_delete" ON "public"."documents";
-- CREATE POLICY "pp_tenant_insert" ON "public"."documents"
--   FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));
-- CREATE POLICY "pp_tenant_update" ON "public"."documents"
--   FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"))
--   WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));
-- CREATE POLICY "pp_tenant_delete" ON "public"."documents"
--   FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));
-- (repeat pattern for invitations)
