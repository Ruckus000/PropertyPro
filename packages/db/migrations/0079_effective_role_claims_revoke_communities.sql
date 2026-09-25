-- 0079_effective_role_claims_revoke_communities
--
-- Two repairs, both order-independent (no column changes):
--
-- 1. pp_rls_effective_role() ignored the role PostgREST actually sends.
--
--    It read only the legacy per-claim GUC `request.jwt.claim.role`, which
--    PostgREST stopped setting in v12 ("Removed db-use-legacy-gucs ... all
--    PostgreSQL versions now use GUCs in JSON format"); Supabase on PG 17 runs
--    v12+, which sets only `request.jwt.claims`. So a service_role Data API
--    request (the admin console's createAdminClient) fell back to session_user
--    `authenticator`, and pp_rls_is_privileged() said false. RLS never showed
--    it, because Supabase's service_role has BYPASSRLS; triggers are not
--    bypassed, so pp_rls_enforce_tenant_scope refuses those writes to tenant
--    tables when no app.current_community_id is set, e.g. the admin console's
--    member edit and remove on user_roles.
--
--    It now delegates to Supabase's own auth.role(), which reads the legacy GUC
--    first and then request.jwt.claims ->> 'role' (production definition, read
--    2026-09-25; scripts/sql/local-supabase-stub.sql mirrors it). One definition
--    of "which role is this request" instead of two that can drift. The Drizzle
--    connection sets neither and still resolves to session_user `postgres`.
--
-- 2. communities is shut to the Data API.
--
--    Its SELECT policy let any member read their community's whole row,
--    including stripe_customer_id, stripe_subscription_id and the cancellation
--    notes. Nothing reads communities as anon or authenticated: every
--    supabase-js `.from('communities')` in apps/*/src and packages/*/src uses
--    the service-role client, and in production no policy, view or publication
--    references it (pg_policies / pg_views / pg_publication_tables, 2026-09-25).
--    The public-site slug lookup is the SECURITY DEFINER
--    pp_public_community_id_by_* RPC. So the grant is pure attack surface, the
--    same reasoning as 0077: revoke it rather than maintain a column list. 0078
--    already took the write privileges. The pp_communities_* policies stay as
--    defence-in-depth.
--
-- Idempotent: CREATE OR REPLACE, and REVOKE of an absent privilege is a no-op.

CREATE OR REPLACE FUNCTION public.pp_rls_effective_role()
 RETURNS text LANGUAGE sql STABLE
 SET search_path TO 'public', 'pg_catalog' AS $function$
  SELECT COALESCE(NULLIF(auth.role(), ''), session_user)::text;
$function$;--> statement-breakpoint

REVOKE ALL ON TABLE public.communities FROM anon, authenticated;
