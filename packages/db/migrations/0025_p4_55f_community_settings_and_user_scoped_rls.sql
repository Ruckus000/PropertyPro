-- P4-55f: Community-configurable write restrictions + user-scoped SELECT policies
-- + SECURITY DEFINER justification comment on pp_rls_has_community_membership.
--
-- Addressing Gemini PR#14 Round 6 findings:
--
-- 1. HIGH — IDOR on user-specific tables:
--    maintenance_requests and notification_preferences used generic pp_tenant_select
--    allowing any community member to view all rows. These tables have user_id /
--    submitted_by_id columns that can enforce row-level user scoping at the DB layer.
--
-- 2. HIGH — Configurable member write restrictions:
--    announcements, meetings, meeting_documents, units, leases, document_categories
--    used generic pp_tenant_{insert,update,delete} allowing any community member to
--    mutate these tables. A new community_settings JSONB column on communities and
--    a pp_rls_community_allows_member_writes() helper allow per-community opt-in to
--    admin-only writes as defense-in-depth.
--
-- 3. MEDIUM — Missing SECURITY DEFINER justification:
--    pp_rls_has_community_membership is re-created with an explanatory comment block.
--
-- Default behavior is backward-compatible: communities with no community_settings
-- entry for a given table retain current open-write behavior.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Add community_settings JSONB column to communities table
-- ─────────────────────────────────────────────────────────────────────────────
-- Shape (all keys optional; absent key = 'all_members' default):
--   {
--     "announcementsWriteLevel":      "all_members" | "admin_only",
--     "meetingsWriteLevel":           "all_members" | "admin_only",
--     "meetingDocumentsWriteLevel":   "all_members" | "admin_only",
--     "unitsWriteLevel":              "all_members" | "admin_only",
--     "leasesWriteLevel":             "all_members" | "admin_only",
--     "documentCategoriesWriteLevel": "all_members" | "admin_only"
--   }
ALTER TABLE "public"."communities"
  ADD COLUMN IF NOT EXISTS "community_settings" jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: New SECURITY DEFINER helper for per-community write-level lookup
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER is required here so that reading the communities table inside
-- an RLS policy expression does not itself trigger RLS evaluation, which would
-- create a potential recursion or privilege-check loop. search_path is explicitly
-- pinned to public, pg_catalog to prevent search-path hijacking attacks.
--
-- Returns TRUE  when member writes are permitted (default when key is absent or 'all_members').
-- Returns FALSE when the community has explicitly set the key to 'admin_only'.
CREATE OR REPLACE FUNCTION "public"."pp_rls_community_allows_member_writes"(
  p_community_id bigint,
  p_setting_key  text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (
      SELECT (c.community_settings ->> p_setting_key) IS DISTINCT FROM 'admin_only'
      FROM "public"."communities" c
      WHERE c.id = p_community_id
    ),
    true
  );
$$;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Re-create pp_rls_has_community_membership with explanatory comment
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER is required here to prevent infinite RLS recursion.
-- Without it, evaluating an RLS policy on the 'user_roles' table would invoke
-- this function, which would in turn SELECT from 'user_roles', triggering its
-- own RLS policies — an infinite loop. SECURITY DEFINER causes the function to
-- execute with the privileges of its owner (postgres), bypassing RLS for its
-- internal SELECT on 'user_roles'. search_path is explicitly pinned to
-- public, auth, pg_catalog to prevent search-path hijacking attacks.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: User-scoped SELECT for maintenance_requests
-- ─────────────────────────────────────────────────────────────────────────────
-- Non-admin actors (owner/tenant) may only SELECT rows they submitted.
-- Admin-tier actors (board_member/board_president/cam/site_manager/property_manager_admin)
-- may SELECT all rows in their community, consistent with app-layer role filtering.
-- INSERT/UPDATE/DELETE retain the generic pp_tenant_* policies (community-scoped).
DROP POLICY IF EXISTS "pp_tenant_select" ON "public"."maintenance_requests";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_maintenance_requests_select" ON "public"."maintenance_requests";
--> statement-breakpoint

CREATE POLICY "pp_maintenance_requests_select"
ON "public"."maintenance_requests"
FOR SELECT
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
-- Step 5: User-scoped SELECT + UPDATE for notification_preferences
-- ─────────────────────────────────────────────────────────────────────────────
-- Each user may only SELECT and UPDATE their own notification preferences.
-- INSERT and DELETE retain generic pp_tenant_* policies (self-INSERT is enforced
-- by the userId JWT claim in the application layer).
DROP POLICY IF EXISTS "pp_tenant_select" ON "public"."notification_preferences";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."notification_preferences";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_notification_preferences_select" ON "public"."notification_preferences";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_notification_preferences_update" ON "public"."notification_preferences";
--> statement-breakpoint

CREATE POLICY "pp_notification_preferences_select"
ON "public"."notification_preferences"
FOR SELECT
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "user_id" = auth.uid()
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_notification_preferences_update"
ON "public"."notification_preferences"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    auth.uid() IS NOT NULL
    AND "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "user_id" = auth.uid()
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
      OR "user_id" = auth.uid()
    )
  )
);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Configurable member-write policies for 6 community-scoped tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Each table gains bespoke pp_{table}_insert/update/delete policies that:
--   a) Always allow privileged (service_role/postgres) actors.
--   b) Always allow admin-tier community members (board_member, board_president,
--      cam, site_manager, property_manager_admin) via pp_rls_can_read_audit_log.
--   c) Allow regular community members only when the community's settings do not
--      restrict that table to admin-only (default: open).
-- The generic SELECT policy (pp_tenant_select) is intentionally retained.

-- announcements
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."announcements";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."announcements";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."announcements";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_announcements_insert" ON "public"."announcements";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_announcements_update" ON "public"."announcements";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_announcements_delete" ON "public"."announcements";
--> statement-breakpoint

CREATE POLICY "pp_announcements_insert"
ON "public"."announcements"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'announcementsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_announcements_update"
ON "public"."announcements"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'announcementsWriteLevel')
    )
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'announcementsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_announcements_delete"
ON "public"."announcements"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'announcementsWriteLevel')
    )
  )
);
--> statement-breakpoint

-- meetings
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."meetings";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."meetings";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."meetings";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_meetings_insert" ON "public"."meetings";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_meetings_update" ON "public"."meetings";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_meetings_delete" ON "public"."meetings";
--> statement-breakpoint

CREATE POLICY "pp_meetings_insert"
ON "public"."meetings"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_meetings_update"
ON "public"."meetings"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingsWriteLevel')
    )
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_meetings_delete"
ON "public"."meetings"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingsWriteLevel')
    )
  )
);
--> statement-breakpoint

-- meeting_documents
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."meeting_documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."meeting_documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."meeting_documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_meeting_documents_insert" ON "public"."meeting_documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_meeting_documents_update" ON "public"."meeting_documents";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_meeting_documents_delete" ON "public"."meeting_documents";
--> statement-breakpoint

CREATE POLICY "pp_meeting_documents_insert"
ON "public"."meeting_documents"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingDocumentsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_meeting_documents_update"
ON "public"."meeting_documents"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingDocumentsWriteLevel')
    )
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingDocumentsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_meeting_documents_delete"
ON "public"."meeting_documents"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'meetingDocumentsWriteLevel')
    )
  )
);
--> statement-breakpoint

-- units
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."units";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."units";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."units";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_units_insert" ON "public"."units";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_units_update" ON "public"."units";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_units_delete" ON "public"."units";
--> statement-breakpoint

CREATE POLICY "pp_units_insert"
ON "public"."units"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'unitsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_units_update"
ON "public"."units"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'unitsWriteLevel')
    )
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'unitsWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_units_delete"
ON "public"."units"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'unitsWriteLevel')
    )
  )
);
--> statement-breakpoint

-- leases
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."leases";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."leases";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."leases";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_leases_insert" ON "public"."leases";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_leases_update" ON "public"."leases";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_leases_delete" ON "public"."leases";
--> statement-breakpoint

CREATE POLICY "pp_leases_insert"
ON "public"."leases"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'leasesWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_leases_update"
ON "public"."leases"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'leasesWriteLevel')
    )
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'leasesWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_leases_delete"
ON "public"."leases"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'leasesWriteLevel')
    )
  )
);
--> statement-breakpoint

-- document_categories
DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."document_categories";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."document_categories";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."document_categories";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_document_categories_insert" ON "public"."document_categories";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_document_categories_update" ON "public"."document_categories";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_document_categories_delete" ON "public"."document_categories";
--> statement-breakpoint

CREATE POLICY "pp_document_categories_insert"
ON "public"."document_categories"
FOR INSERT
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'documentCategoriesWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_document_categories_update"
ON "public"."document_categories"
FOR UPDATE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'documentCategoriesWriteLevel')
    )
  )
)
WITH CHECK (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'documentCategoriesWriteLevel')
    )
  )
);
--> statement-breakpoint

CREATE POLICY "pp_document_categories_delete"
ON "public"."document_categories"
FOR DELETE
USING (
  "public"."pp_rls_is_privileged"()
  OR (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_can_read_audit_log"("community_id")
      OR "public"."pp_rls_community_allows_member_writes"("community_id", 'documentCategoriesWriteLevel')
    )
  )
);

-- Rollback (manual):
-- DROP POLICY IF EXISTS "pp_maintenance_requests_select" ON "public"."maintenance_requests";
-- CREATE POLICY "pp_tenant_select" ON "public"."maintenance_requests"
--   FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));
-- DROP POLICY IF EXISTS "pp_notification_preferences_select" ON "public"."notification_preferences";
-- DROP POLICY IF EXISTS "pp_notification_preferences_update" ON "public"."notification_preferences";
-- CREATE POLICY "pp_tenant_select" ON "public"."notification_preferences"
--   FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));
-- CREATE POLICY "pp_tenant_update" ON "public"."notification_preferences"
--   FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"))
--   WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));
-- (For each configurable table: drop pp_{table}_insert/update/delete,
--  re-create pp_tenant_insert/update/delete with pp_rls_can_access_community check.)
-- DROP FUNCTION IF EXISTS "public"."pp_rls_community_allows_member_writes"(bigint, text);
-- ALTER TABLE "public"."communities" DROP COLUMN IF EXISTS "community_settings";
