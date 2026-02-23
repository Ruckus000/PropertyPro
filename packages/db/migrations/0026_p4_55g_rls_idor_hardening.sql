-- P4-55g: IDOR hardening — user-scoped UPDATE/DELETE on maintenance_requests,
-- user-scoped INSERT/DELETE on notification_preferences, admin-only writes on
-- onboarding_wizard_state, authorized-viewer-only INSERT on maintenance_comments,
-- and RLS on the communities table (previously excluded as no community_id column).
--
-- Addressing Gemini PR#14 findings (rounds following 0025):
--
-- 1. HIGH — maintenance_requests IDOR on UPDATE/DELETE:
--    Generic pp_tenant_update/delete allowed any community member to mutate any
--    other member's maintenance request. Replaced with user-scoped policies that
--    allow update/delete only by the submitter (submitted_by_id = auth.uid()) or
--    admin-tier roles (pp_rls_can_read_audit_log).
--
-- 2. HIGH — notification_preferences IDOR on INSERT/DELETE:
--    Generic pp_tenant_insert/delete allowed any community member to create or
--    remove another user's preferences. Replaced with user-scoped policies that
--    restrict to user_id = auth.uid() (or admin-tier / privileged roles).
--
-- 3. MEDIUM — onboarding_wizard_state broken access control:
--    Generic pp_tenant_update/delete allowed any community member (including
--    tenant role) to corrupt wizard state. All writes are now restricted to
--    admin-tier roles, consistent with the app-layer requireMutationAuthorization
--    guard. INSERT is also hardened to match.
--
-- 4. MEDIUM — maintenance_comments INSERT IDOR:
--    Generic pp_tenant_insert allowed commenting on requests the user cannot view
--    (SELECT is user-scoped in 0025). INSERT now requires either admin-tier role
--    or a verified relationship to the request via submitted_by_id = auth.uid().
--
-- 5. MEDIUM — communities table has no RLS:
--    communities was excluded from RLS globally (no community_id column). It contains
--    sensitive billing data (stripeCustomerId, stripeSubscriptionId). A new SECURITY
--    DEFINER helper (pp_rls_user_is_community_member) checks user_roles without RLS
--    recursion, enabling full per-row isolation on the communities table.

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue 1: maintenance_requests — harden UPDATE and DELETE
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop generic policies left by migration 0020.
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."maintenance_requests";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."maintenance_requests";
--> statement-breakpoint
-- Idempotent guards for bespoke policies.
DROP POLICY IF EXISTS "pp_maintenance_requests_update" ON "public"."maintenance_requests";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_maintenance_requests_delete" ON "public"."maintenance_requests";
--> statement-breakpoint

-- UPDATE: submitter or admin-tier may modify; privileged DB roles always pass.
CREATE POLICY "pp_maintenance_requests_update"
ON "public"."maintenance_requests"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "submitted_by_id" = auth.uid()
    )
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "submitted_by_id" = auth.uid()
    )
  )
);
--> statement-breakpoint

-- DELETE: same logic as UPDATE — submitter or admin-tier may remove.
CREATE POLICY "pp_maintenance_requests_delete"
ON "public"."maintenance_requests"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "submitted_by_id" = auth.uid()
    )
  )
);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue 2: notification_preferences — harden INSERT and DELETE
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop generic policies left by migration 0020.
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."notification_preferences";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."notification_preferences";
--> statement-breakpoint
-- Idempotent guards for bespoke policies.
DROP POLICY IF EXISTS "pp_notification_preferences_insert" ON "public"."notification_preferences";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_notification_preferences_delete" ON "public"."notification_preferences";
--> statement-breakpoint

-- INSERT: user may only create preferences for themselves; admin-tier may manage any user.
CREATE POLICY "pp_notification_preferences_insert"
ON "public"."notification_preferences"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "user_id" = auth.uid()
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);
--> statement-breakpoint

-- DELETE: user may only delete their own preferences; admin-tier may remove any.
CREATE POLICY "pp_notification_preferences_delete"
ON "public"."notification_preferences"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "user_id" = auth.uid()
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue 3: onboarding_wizard_state — restrict ALL writes to admin-tier
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop generic policies left by migration 0020.
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."onboarding_wizard_state";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."onboarding_wizard_state";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."onboarding_wizard_state";
--> statement-breakpoint
-- Idempotent guards for bespoke policies.
DROP POLICY IF EXISTS "pp_onboarding_wizard_state_insert" ON "public"."onboarding_wizard_state";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_onboarding_wizard_state_update" ON "public"."onboarding_wizard_state";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_onboarding_wizard_state_delete" ON "public"."onboarding_wizard_state";
--> statement-breakpoint

CREATE POLICY "pp_onboarding_wizard_state_insert"
ON "public"."onboarding_wizard_state"
FOR INSERT
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_onboarding_wizard_state_update"
ON "public"."onboarding_wizard_state"
FOR UPDATE
USING ("public"."pp_rls_can_read_audit_log"("community_id"))
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_onboarding_wizard_state_delete"
ON "public"."onboarding_wizard_state"
FOR DELETE
USING ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue 4: maintenance_comments — harden INSERT
-- ─────────────────────────────────────────────────────────────────────────────
-- The existing pp_tenant_select on maintenance_comments is intentionally retained
-- (SELECT open to community members; UPDATE/DELETE absent because the table is
-- append-only per migration 0022). Only INSERT is hardened here.
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."maintenance_comments";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_maintenance_comments_insert" ON "public"."maintenance_comments";
--> statement-breakpoint

-- INSERT: user must be able to view the associated request (admin-tier or submitter).
-- The EXISTS subquery reads maintenance_requests unscoped because INSERT policies
-- evaluate the NEW row — "request_id" and "community_id" below refer to the
-- about-to-be-inserted row's columns.
CREATE POLICY "pp_maintenance_comments_insert"
ON "public"."maintenance_comments"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR EXISTS (
        SELECT 1
        FROM "public"."maintenance_requests" mr
        WHERE mr.id = "request_id"
          AND mr.community_id = "community_id"
          AND mr.submitted_by_id = auth.uid()
          AND mr.deleted_at IS NULL
      )
    )
  )
);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue 5: communities — enable RLS and add per-community row policies
-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: check community membership without hitting user_roles RLS (SECURITY DEFINER
-- executes as the function owner, bypassing RLS on user_roles to prevent recursion).
-- Mirrors pp_rls_has_community_membership but keys off the communities.id column
-- rather than a community_id FK column.
CREATE OR REPLACE FUNCTION "public"."pp_rls_user_is_community_member"(target_community_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
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

ALTER TABLE "public"."communities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY ensures the table owner role is also subject to RLS
-- (by default, PostgreSQL table owners bypass RLS unless FORCE is set).
ALTER TABLE "public"."communities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Idempotent guards.
DROP POLICY IF EXISTS "pp_communities_select" ON "public"."communities";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_communities_insert" ON "public"."communities";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_communities_update" ON "public"."communities";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_communities_delete" ON "public"."communities";
--> statement-breakpoint

-- SELECT: community members see only their own community's row.
CREATE POLICY "pp_communities_select"
ON "public"."communities"
FOR SELECT
USING ("public"."pp_rls_user_is_community_member"("id"));
--> statement-breakpoint

-- INSERT: only privileged roles (service_role / postgres) may provision communities.
CREATE POLICY "pp_communities_insert"
ON "public"."communities"
FOR INSERT
WITH CHECK ("public"."pp_rls_is_privileged"());
--> statement-breakpoint

-- UPDATE: admin-tier roles within the community (e.g. updating branding / settings);
-- privileged roles retain unconditional access for migrations and background jobs.
CREATE POLICY "pp_communities_update"
ON "public"."communities"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_user_is_community_member"("id")
    AND "public"."pp_rls_can_read_audit_log"("id")
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_user_is_community_member"("id")
    AND "public"."pp_rls_can_read_audit_log"("id")
  )
);
--> statement-breakpoint

-- DELETE: privileged only — communities are deprovisioned through internal tooling only.
CREATE POLICY "pp_communities_delete"
ON "public"."communities"
FOR DELETE
USING ("public"."pp_rls_is_privileged"());
