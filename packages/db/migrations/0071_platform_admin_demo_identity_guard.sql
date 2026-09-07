-- 0071_platform_admin_demo_identity_guard
--
-- WHY: a demo-seeded identity must never hold platform admin. CLAUDE.md has
-- asserted this since the admin app shipped ("the demo persona
-- pm.admin@sunset.local never holds platform privilege"), and
-- docs/audits/2026-08-03-e2e-inventory.md repeats it — but nothing enforced it,
-- and production violated it for roughly six months: `pm.admin@sunset.local`
-- held super_admin from 2026-03-12 until it was revoked alongside this
-- migration. Every demo persona shares one DEMO_DEFAULT_PASSWORD, so that row
-- made the whole operator console reachable with a credential that is printed
-- in .env.example.
--
-- A repo guard cannot close this. The grant that caused it was a manual INSERT,
-- not a code path — `pnpm seed:demo` deliberately leaves platform_admin_users
-- empty and no script in scripts/ writes to it. The check therefore has to live
-- where the write lands.
--
-- Reachability: platform_admin_users is written from exactly two places — the
-- POST in apps/admin/src/app/api/admin/platform-admins/route.ts (an email
-- lookup, so a demo address is reachable by typo) and the development-only
-- upsert in apps/admin/src/app/dev/agent-login/route.ts — plus manual SQL,
-- which is how the incident happened and which no application-layer check sees.
--
-- SAFETY: order-independent. A pure trigger guard: it adds no column, removes
-- nothing, and BEFORE INSERT OR UPDATE never fires for rows that already exist,
-- so applying it does not disturb the current table. It may be applied before
-- or after the accompanying code ships.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, plus DROP TRIGGER IF EXISTS
-- immediately before CREATE TRIGGER (the house idiom, cf. 0052 and 0056).

-- SECURITY DEFINER, unlike 0056's INVOKER on the same table — and the
-- difference is forced, not stylistic. Writes arrive as `service_role` through
-- PostgREST, and while service_role holds rolbypassrls and USAGE on the auth
-- schema, it has NO SELECT privilege on auth.users:
--
--   has_table_privilege('service_role','auth.users','SELECT')  =>  false
--
-- (measured against production 2026-09-06; auth.users is owned by
-- supabase_auth_admin, and bypassrls waives row policies, never table grants).
-- An INVOKER function would therefore raise 42501 "permission denied for table
-- users" on EVERY grant, breaking the console's Add-admin flow instead of
-- guarding it. DEFINER runs as the migration owner (postgres), which does hold
-- that SELECT.
--
-- No REVOKE EXECUTE ... FROM public is needed: Postgres refuses to invoke a
-- function returning `trigger` outside a trigger context, so the widened
-- privilege has no callable surface.
CREATE OR REPLACE FUNCTION "public"."pp_reject_demo_platform_admin"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_catalog'
AS $$
DECLARE
  target_email text;
BEGIN
  SELECT u.email INTO target_email
  FROM auth.users u
  WHERE u.id = NEW.user_id;

  -- No auth user yet: stay silent and let the foreign key be the authority on
  -- referential integrity. Raising here would report a missing account as a
  -- demo-identity violation, which is a misleading error for a real bug.
  IF target_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- '%@%.local' is deliberately NOT '%.local%' or '%local%'.
  --
  -- It must match the seeded personas -- @sunset.local, @palm.local,
  -- @sunsetridge.local, @bayview.local -- while NOT matching
  -- 'e2e.platform.admin@local', which
  -- apps/admin/src/app/dev/agent-login/route.ts upserts a grant for on every
  -- local e2e run. That address's domain is bare 'local' with no dot, so it
  -- falls outside a pattern that requires a dot before 'local'. Broadening this
  -- to '%local%' would pass review and silently break the entire admin e2e
  -- suite, which cannot reach a single page without that grant.
  --
  -- '%@demo-%' covers per-instance demo users
  -- (demo-resident@demo-<slug>-<hash>.propertyprofl.com).
  --
  -- Verified against all 71 production auth.users on 2026-09-06: 45 matched
  -- (every seed persona and demo-instance user, including the offending
  -- pm.admin@sunset.local), 26 did not (real staff).
  --
  -- Re-measured 2026-09-07 while renumbering: 70 users, 45 matched, 25 did not.
  -- The original note said 28, which does not add up to its own stated 71; the
  -- load-bearing claim was re-verified directly and holds —
  -- 'e2e.platform.admin@local' LIKE '%@%.local' is FALSE (so a local e2e run is
  -- untouched) and 'pm.admin@sunset.local' is TRUE.
  IF target_email LIKE '%@%.local' OR target_email LIKE '%@demo-%' THEN
    RAISE EXCEPTION
      'platform_admin_users refuses demo-seeded identity %; demo accounts share DEMO_DEFAULT_PASSWORD and must never hold platform admin',
      target_email
      USING ERRCODE = 'check_violation',
            HINT = 'Grant platform admin to a real operator account instead.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "pp_reject_demo_platform_admin" ON "public"."platform_admin_users";
--> statement-breakpoint

CREATE TRIGGER "pp_reject_demo_platform_admin"
BEFORE INSERT OR UPDATE ON "public"."platform_admin_users"
FOR EACH ROW EXECUTE FUNCTION "public"."pp_reject_demo_platform_admin"();
