-- P4-55d: Elevate compliance_checklist_items, contract_bids, and contracts from
-- tenant_crud to tenant_admin_write policy family.
--
-- Finding (Gemini PR#14): Several tables whose application-layer routes already restrict
-- writes to admin-tier roles were assigned the generic tenant_crud policy family in 0020,
-- allowing any community member to INSERT/UPDATE/DELETE at the DB level.
--
-- Tables elevated:
--   compliance_checklist_items — writes gated to site_manager/property_manager_admin
--     via requireMutationAuthorization in onboarding routes.
--   contract_bids — writes gated to ADMIN_ROLES (board_member, board_president, cam,
--     site_manager, property_manager_admin) via requireAdminRole in contracts route.
--   contracts — same ADMIN_ROLES restriction via requireAdminRole.
--
-- Tables intentionally kept as tenant_crud in this migration (not elevated here):
--   leases — kept open by default; migration 0025 adds per-community configurable write
--     restriction via community_settings.leasesWriteLevel ('all_members' | 'admin_only').
--   units  — import-residents route requires open INSERT; migration 0025 adds per-community
--     configurable write restriction via community_settings.unitsWriteLevel.
--   Operators wanting admin-only writes for these tables should set the appropriate
--   community_settings key after migration 0025 is applied.
--
-- Policy naming convention: pp_{table_name}_insert/update/delete for bespoke
-- admin-write policies, pp_tenant_select retained for SELECT (community membership).
-- This matches the user_roles precedent from migrations 0021/0022.

-- compliance_checklist_items
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."compliance_checklist_items";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."compliance_checklist_items";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."compliance_checklist_items";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_compliance_checklist_items_insert" ON "public"."compliance_checklist_items";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_compliance_checklist_items_update" ON "public"."compliance_checklist_items";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_compliance_checklist_items_delete" ON "public"."compliance_checklist_items";
--> statement-breakpoint

CREATE POLICY "pp_compliance_checklist_items_insert"
ON "public"."compliance_checklist_items"
FOR INSERT
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_compliance_checklist_items_update"
ON "public"."compliance_checklist_items"
FOR UPDATE
USING ("public"."pp_rls_can_read_audit_log"("community_id"))
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_compliance_checklist_items_delete"
ON "public"."compliance_checklist_items"
FOR DELETE
USING ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

-- contract_bids
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."contract_bids";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."contract_bids";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."contract_bids";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_contract_bids_insert" ON "public"."contract_bids";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_contract_bids_update" ON "public"."contract_bids";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_contract_bids_delete" ON "public"."contract_bids";
--> statement-breakpoint

CREATE POLICY "pp_contract_bids_insert"
ON "public"."contract_bids"
FOR INSERT
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_contract_bids_update"
ON "public"."contract_bids"
FOR UPDATE
USING ("public"."pp_rls_can_read_audit_log"("community_id"))
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_contract_bids_delete"
ON "public"."contract_bids"
FOR DELETE
USING ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

-- contracts
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."contracts";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."contracts";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."contracts";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_contracts_insert" ON "public"."contracts";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_contracts_update" ON "public"."contracts";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_contracts_delete" ON "public"."contracts";
--> statement-breakpoint

CREATE POLICY "pp_contracts_insert"
ON "public"."contracts"
FOR INSERT
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_contracts_update"
ON "public"."contracts"
FOR UPDATE
USING ("public"."pp_rls_can_read_audit_log"("community_id"))
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_contracts_delete"
ON "public"."contracts"
FOR DELETE
USING ("public"."pp_rls_can_read_audit_log"("community_id"));

-- Rollback (manual):
-- DROP POLICY IF EXISTS "pp_compliance_checklist_items_insert" ON "public"."compliance_checklist_items";
-- DROP POLICY IF EXISTS "pp_compliance_checklist_items_update" ON "public"."compliance_checklist_items";
-- DROP POLICY IF EXISTS "pp_compliance_checklist_items_delete" ON "public"."compliance_checklist_items";
-- CREATE POLICY "pp_tenant_insert" ON "public"."compliance_checklist_items"
--   FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));
-- CREATE POLICY "pp_tenant_update" ON "public"."compliance_checklist_items"
--   FOR UPDATE USING (...) WITH CHECK (...);
-- CREATE POLICY "pp_tenant_delete" ON "public"."compliance_checklist_items"
--   FOR DELETE USING (...);
-- (repeat pattern for contract_bids and contracts)
