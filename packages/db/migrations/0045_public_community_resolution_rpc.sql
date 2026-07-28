-- 0045_public_community_resolution_rpc
--
-- ===========================================================================
-- THE OUTAGE THIS FIXES
-- ===========================================================================
--
-- WHY: every community's public website served "Community not found." behind an
-- HTTP 200 — the §718.111(12)(g) statutory-transparency page a Florida condo
-- association is legally required to publish.
--
-- `middleware.ts` resolves a subdomain (or custom domain) to a community id
-- before rewriting to the public-site renderer. It does that through the client
-- built in `packages/db/src/supabase/middleware.ts`, which is constructed with
-- NEXT_PUBLIC_SUPABASE_ANON_KEY — so for a visitor with no session the query
-- runs as `anon`.
--
-- `communities` has RLS enabled AND forced, and its SELECT policy is
--   pp_communities_select  USING (pp_rls_has_community_membership(id))
-- whose body begins `WHEN auth.uid() IS NULL THEN false`. An anonymous request
-- therefore matches zero rows. The lookup returned null, the `x-community-id`
-- header was never set, and `app/public-site/page.tsx` rendered its
-- "Community not found." branch.
--
-- Verified against production with production's own anon key:
--   GET /rest/v1/communities?select=id&slug=eq.sunset-condos  ->  []
--
-- Why it survived so long: an AUTHENTICATED member passes the membership check,
-- so the lookup works for them and the middleware redirects them to /dashboard.
-- Every human who ever loaded the site was logged in. The only visitor who hits
-- the broken path is the anonymous public — the entire audience the page exists
-- for. It returned 200 throughout, so nothing alerted, and `deploy.yml`'s smoke
-- test only curls `/auth/login`.
--
-- ===========================================================================
-- WHY A SECURITY DEFINER FUNCTION AND NOT AN ANON POLICY ON communities
-- ===========================================================================
--
-- The tempting fix is a permissive SELECT policy for `anon`. Do not. RLS is
-- row-level, `anon` already holds a table-wide SELECT grant, and PostgREST would
-- immediately expose EVERY column of the root tenant table to the internet:
-- subscription_plan, stripe_subscription_id, subscription_status, branding, the
-- full street address. Fixing a rendering bug by publishing the billing table is
-- not a trade worth making.
--
-- These functions return a single bigint and nothing else. RLS on `communities`
-- is untouched; no new row becomes readable by anyone.
--
-- Nothing is disclosed that was not already public: the slug IS the hostname the
-- visitor typed, and the community id already appears in public URLs as
-- `?communityId=`. The mapping is inherently enumerable by anyone with DNS.
--
-- The predicates deliberately MATCH the queries they replace, no tighter. In
-- particular there is no "only if published" filter: the same resolution feeds
-- /transparency, /notices, /request-access and the unavailable page, so
-- narrowing it here would trade one broken page for four.
--
-- ===========================================================================
-- THE ADVISOR LINTS THIS ADDS ARE EXPECTED. DO NOT "FIX" THEM.
-- ===========================================================================
--
-- Supabase's linter now reports these two functions under 0028
-- (anon_security_definer_function_executable) and 0029 (the authenticated
-- equivalent), and recommends revoking EXECUTE or switching to SECURITY
-- INVOKER. Doing either takes the public site down again — being callable by
-- `anon` IS the requirement, and SECURITY INVOKER would put us straight back
-- behind the membership policy that caused the outage.
--
-- Migration 0039 already carries the same warning for the four pre-existing
-- SECURITY DEFINER functions and explains the general rule; these two join that
-- list, taking each lint from 4 functions to 6. Advisor state after applying:
-- zero ERROR-level lints, which is the bar.
--
-- What makes them safe despite the lint: each takes one text argument, performs
-- one lookup, and returns one bigint. There is no dynamic SQL, no side effect,
-- `search_path` is pinned so `communities` cannot be shadowed, and the value
-- returned is already public (the slug is the hostname; the id is in public
-- URLs). They are STABLE, so they cannot write.
--
-- SAFETY: EXPAND. Adds two functions; changes no table, policy, or row. Apply
-- BEFORE the code that calls it ships — and it must be, because the calling code
-- 500s on its first request otherwise. No new tenant table, so
-- RLS_EXPECTED_TENANT_TABLE_COUNT does not move.
--
-- Idempotent: CREATE OR REPLACE, and the REVOKE/GRANT pair no-ops when already
-- in the target state. REVOKE precedes GRANT because the implicit PUBLIC EXECUTE
-- grant makes a role-only revoke silently do nothing — the same trap 0039
-- documents for the RLS helpers.

CREATE OR REPLACE FUNCTION public.pp_public_community_id_by_slug(p_slug text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT c.id
  FROM public.communities c
  WHERE c.slug = p_slug
    AND c.deleted_at IS NULL
  LIMIT 1;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.pp_public_community_id_by_domain(p_host text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT c.id
  FROM public.communities c
  WHERE c.custom_domain = p_host
    AND c.custom_domain_status = 'active'
    AND c.deleted_at IS NULL
  LIMIT 1;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.pp_public_community_id_by_slug(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.pp_public_community_id_by_domain(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.pp_public_community_id_by_slug(text) TO anon, authenticated, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.pp_public_community_id_by_domain(text) TO anon, authenticated, service_role;--> statement-breakpoint
COMMENT ON FUNCTION public.pp_public_community_id_by_slug(text) IS
  'Public host -> community id for middleware tenant resolution. SECURITY DEFINER because communities.pp_communities_select requires membership and an anonymous visitor has none. Returns only the id; RLS on communities is unchanged.';--> statement-breakpoint
COMMENT ON FUNCTION public.pp_public_community_id_by_domain(text) IS
  'Verified custom domain -> community id for middleware tenant resolution. See pp_public_community_id_by_slug for why this is SECURITY DEFINER.';
