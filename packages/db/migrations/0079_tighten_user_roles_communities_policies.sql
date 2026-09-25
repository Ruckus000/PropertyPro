-- 0079_tighten_user_roles_communities_policies
--
-- WHY: make the RLS rules on user_roles and communities match ADR-006 instead
-- of relying on 0078's grant revoke to keep them unreachable.
--
-- 0078 removed every Data API write grant, which closed the two worst holes in
-- practice. But the POLICIES still said:
--
--   * user_roles INSERT/UPDATE/DELETE: pp_rls_can_read_audit_log(community_id),
--     i.e. any property_manager may write any role row in their community,
--     including demoting the root_manager and promoting themselves, and setting
--     `designation` (board seats). ADR-006 §2 makes role assignment,
--     designation and root transfer ROOT-EXCLUSIVE; the app enforces it with
--     requireRootManager on /communities/role-assignments, /designations and
--     /transfer-root, and the residents route (PM-accessible) only ever writes
--     role = 'resident' rows and refuses to touch manager rows.
--   * communities UPDATE: any property_manager, every column, so
--     subscription_plan / subscription_status / free_access_expires_at /
--     is_demo / stripe_* / deleted_at were writable. Those are written only by
--     Stripe webhooks, the lifecycle cron and root-only routes, all on a
--     privileged connection.
--   * communities SELECT: whole row to any member, including stripe_customer_id,
--     stripe_subscription_id and cancellation notes.
--
-- If any future change re-grants a write, or a user-JWT write path appears, the
-- policies are what would stand. So they should say what the app says.
--
-- WHAT CHANGES:
--
--   0. pp_rls_effective_role() now also reads `request.jwt.claims` ->> 'role'.
--      It read only the legacy per-claim GUC `request.jwt.claim.role`, which
--      PostgREST stopped setting in v12 ("Removed db-use-legacy-gucs ... all
--      PostgreSQL versions now use GUCs in JSON format"); Supabase on PG 17
--      runs v12+. So a service_role Data API request (the admin console's
--      createAdminClient) resolved to session_user `authenticator` and
--      pp_rls_is_privileged() said false. RLS never showed it, because Supabase's
--      service_role has BYPASSRLS; triggers are not bypassed, so the existing
--      pp_rls_enforce_tenant_scope trigger and the new triggers below would
--      refuse those writes. The legacy GUC is still honoured first (tests and
--      older callers set it); the Drizzle connection has neither and still
--      resolves to session_user `postgres`.
--   1. pp_rls_is_root_manager(community_id): SECURITY DEFINER, same shape as
--      pp_rls_can_read_audit_log (privileged -> true; no JWT -> false; else a
--      root_manager row for auth.uid() in that community).
--   2. user_roles INSERT/UPDATE/DELETE: root manager (or privileged) may write
--      any row; the rest of the admin tier may write only role = 'resident'
--      rows, in both USING and WITH CHECK, so a property_manager can neither
--      touch a manager row nor turn a resident into one. A property_manager's
--      own row is a manager row, so self-modification is out too (the residents
--      route's "Cannot modify your own role").
--   3. user_roles trigger: a non-root, non-privileged writer cannot set or
--      change `designation`, cannot move a role row to another user or
--      community (which would hand a board seat to someone else without
--      touching `designation`), and cannot delete a board-designated row.
--      RLS cannot compare OLD with NEW, so this part is a trigger.
--   4. communities trigger: a non-privileged UPDATE cannot change billing,
--      lifecycle, domain or identity columns, nor the
--      community_settings.electionsAttorneyReviewed key (the e-voting
--      attorney-review gate, set only by platform admins). Nobody, root
--      included, writes those except through a privileged path, so no role
--      carve-out is needed.
--   5. communities SELECT: table-level SELECT is replaced by a column grant to
--      authenticated that omits the Stripe ids and billing/cancellation
--      internals. anon gets nothing (its policy never matched a row: anon has no
--      membership; the public-site lookup is the SECURITY DEFINER RPC). A column
--      added later is NOT granted automatically, which is the safe default.
--
-- Every change keeps the privileged path open, so the application (Drizzle on
-- postgres, service_role clients, crons) is unaffected: all current writers of
-- both tables run privileged (grep over apps/*/src, packages/*/src).
--
-- SAFETY: policy/trigger/grant repair, no schema change, so it is
-- order-independent (.claude/rules/migration-safety.md). Policies are dropped
-- and recreated under their existing names, which takes ACCESS EXCLUSIVE on
-- both tables; lock_timeout bounds the wait. Idempotent: CREATE OR REPLACE,
-- DROP ... IF EXISTS, and REVOKE/GRANT that no-op when already in place.

SET LOCAL lock_timeout = '5s';--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_rls_effective_role()
 RETURNS text LANGUAGE sql STABLE
 SET search_path TO 'public', 'pg_catalog' AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
    session_user
  )::text;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_rls_is_root_manager(target_community_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog' AS $function$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (SELECT 1 FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid() AND ur.community_id = target_community_id
        AND ur.role = 'root_manager')
  END;
$function$;--> statement-breakpoint

DROP POLICY IF EXISTS "pp_user_roles_insert" ON public."user_roles";--> statement-breakpoint
CREATE POLICY "pp_user_roles_insert" ON public."user_roles" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    pp_rls_is_root_manager(community_id)
    OR (pp_rls_can_read_audit_log(community_id) AND role = 'resident')
  );--> statement-breakpoint

DROP POLICY IF EXISTS "pp_user_roles_update" ON public."user_roles";--> statement-breakpoint
CREATE POLICY "pp_user_roles_update" ON public."user_roles" AS PERMISSIVE FOR UPDATE TO public
  USING (
    pp_rls_is_root_manager(community_id)
    OR (pp_rls_can_read_audit_log(community_id) AND role = 'resident')
  )
  WITH CHECK (
    pp_rls_is_root_manager(community_id)
    OR (pp_rls_can_read_audit_log(community_id) AND role = 'resident')
  );--> statement-breakpoint

DROP POLICY IF EXISTS "pp_user_roles_delete" ON public."user_roles";--> statement-breakpoint
CREATE POLICY "pp_user_roles_delete" ON public."user_roles" AS PERMISSIVE FOR DELETE TO public
  USING (
    pp_rls_is_root_manager(community_id)
    OR (pp_rls_can_read_audit_log(community_id) AND role = 'resident')
  );--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_user_roles_guard_designation()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.designation IS NOT NULL AND NOT pp_rls_is_root_manager(OLD.community_id) THEN
      RAISE EXCEPTION 'only the root manager can remove a board-designated member'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF pp_rls_is_root_manager(NEW.community_id) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.designation IS NOT NULL THEN
    RAISE EXCEPTION 'only the root manager can set a board designation'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.designation IS DISTINCT FROM OLD.designation THEN
      RAISE EXCEPTION 'only the root manager can change a board designation'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.community_id IS DISTINCT FROM OLD.community_id THEN
      RAISE EXCEPTION 'only the root manager can reassign a role row'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

DROP TRIGGER IF EXISTS pp_user_roles_guard_designation ON public.user_roles;--> statement-breakpoint
CREATE TRIGGER pp_user_roles_guard_designation
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.pp_user_roles_guard_designation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_communities_guard_protected_columns()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog' AS $function$
DECLARE
  col text;
  new_row jsonb;
  old_row jsonb;
BEGIN
  IF pp_rls_is_privileged() THEN
    RETURN NEW;
  END IF;
  new_row := to_jsonb(NEW);
  old_row := to_jsonb(OLD);
  FOREACH col IN ARRAY ARRAY[
    'id', 'slug', 'community_type', 'billing_group_id',
    'stripe_customer_id', 'stripe_subscription_id',
    'subscription_plan', 'subscription_status',
    'subscription_current_period_end_at', 'subscription_canceled_at',
    'payment_failed_at', 'next_reminder_at',
    'cancellation_reason', 'cancellation_note', 'cancellation_captured_at',
    'free_access_expires_at', 'trial_ends_at',
    'is_demo', 'demo_expires_at', 'deleted_at',
    'custom_domain', 'custom_domain_status', 'custom_domain_verified_at'
  ]
  LOOP
    IF (new_row -> col) IS DISTINCT FROM (old_row -> col) THEN
      RAISE EXCEPTION 'communities.% can only be changed by the application', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF (new_row -> 'community_settings' -> 'electionsAttorneyReviewed')
     IS DISTINCT FROM (old_row -> 'community_settings' -> 'electionsAttorneyReviewed') THEN
    RAISE EXCEPTION 'communities.community_settings.electionsAttorneyReviewed can only be changed by the application'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

DROP TRIGGER IF EXISTS pp_communities_guard_protected_columns ON public.communities;--> statement-breakpoint
CREATE TRIGGER pp_communities_guard_protected_columns
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.pp_communities_guard_protected_columns();--> statement-breakpoint

REVOKE SELECT ON TABLE public.communities FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT (
  id, name, slug, community_type, timezone,
  address_line1, address_line2, city, state, zip_code,
  logo_path, branding, community_settings,
  subscription_plan, subscription_status, is_demo, demo_expires_at, trial_ends_at,
  custom_domain, custom_domain_status, custom_domain_verified_at,
  site_published_at, site_onboarding_completed_at, site_onboarding_progress,
  contact_name, contact_email, contact_phone,
  transparency_enabled, transparency_acknowledged_at,
  snowbird_digest_enabled,
  urgent_notice_text, urgent_notice_expires_at, urgent_notice_set_at, urgent_notice_set_by,
  created_at, updated_at, deleted_at
) ON TABLE public.communities TO authenticated;
