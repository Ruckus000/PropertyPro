-- 0101: RLS policies for emergency notification tables (Phase 1B).
--
-- Adds defense-in-depth RLS policies for:
--   emergency_broadcasts
--   emergency_broadcast_recipients
--
-- Primary tenant isolation is via createScopedClient() (application layer).
-- These policies provide a second layer if the app layer is ever bypassed.
-- Privileged roles (service_role / postgres) are always permitted.

-- ---------------------------------------------------------------------------
-- 1. emergency_broadcasts
-- ---------------------------------------------------------------------------

-- SELECT: community members can read their community's broadcasts.
CREATE POLICY "pp_emergency_broadcasts_select"
ON "public"."emergency_broadcasts"
FOR SELECT
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);

--> statement-breakpoint

-- INSERT: community members with write access (enforced at app layer via RBAC).
CREATE POLICY "pp_emergency_broadcasts_insert"
ON "public"."emergency_broadcasts"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);

--> statement-breakpoint

-- UPDATE: same as insert — app layer enforces write permission via RBAC.
CREATE POLICY "pp_emergency_broadcasts_update"
ON "public"."emergency_broadcasts"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);

--> statement-breakpoint

-- DELETE: same pattern (soft delete via app layer, hard delete blocked).
CREATE POLICY "pp_emergency_broadcasts_delete"
ON "public"."emergency_broadcasts"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. emergency_broadcast_recipients
-- ---------------------------------------------------------------------------

-- SELECT: community members can read recipient statuses for their community.
CREATE POLICY "pp_emergency_broadcast_recipients_select"
ON "public"."emergency_broadcast_recipients"
FOR SELECT
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);

--> statement-breakpoint

-- INSERT: broadcast creation inserts recipients (app-layer RBAC enforced).
CREATE POLICY "pp_emergency_broadcast_recipients_insert"
ON "public"."emergency_broadcast_recipients"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);

--> statement-breakpoint

-- UPDATE: delivery status updates (from webhook handler or broadcast execution).
CREATE POLICY "pp_emergency_broadcast_recipients_update"
ON "public"."emergency_broadcast_recipients"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);

--> statement-breakpoint

-- DELETE: not expected in normal flow, but included for completeness.
CREATE POLICY "pp_emergency_broadcast_recipients_delete"
ON "public"."emergency_broadcast_recipients"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
  )
);
