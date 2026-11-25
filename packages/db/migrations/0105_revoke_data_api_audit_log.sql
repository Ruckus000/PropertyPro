-- 0105_revoke_data_api_audit_log
--
-- WHY: close the Supabase Data API as a door into compliance_audit_log.
--
-- 0077 shut 59 tenant tables to anon/authenticated and 0078 made the rest
-- read-only, but compliance_audit_log was missed by the first and, being
-- SELECT-able, left open by the second. Its SELECT policy admits a community's
-- managers (pp_rls_can_read_audit_log) on their own JWT, so a manager holding
-- their session token and the public anon key can call
-- `GET /rest/v1/compliance_audit_log?community_id=eq.<theirs>` and read every
-- raw row, including old_values, new_values and metadata, bypassing the
-- application's read-side rules (audit-trail-service redaction and the
-- permission checks in front of it). Measured read-only against production:
-- authenticated and anon both hold SELECT on the table.
--
-- WHY REVOKE: nothing in the application reads this table as `authenticated`.
-- Tenant reads and writes go through createScopedClient (Drizzle on a role
-- pp_rls_is_privileged() accepts), and the only supabase-js `.from()` calls on
-- it, the three in apps/admin site-templates routes, use the service-role
-- client (createAdminTypedClient). So the grant is pure attack surface, and the
-- ACL is the right control (0077's reasoning). The RLS policies stay as
-- defence-in-depth.
--
-- WHAT STAYS: only anon and authenticated are revoked. The policies, the
-- append-only trigger, service_role and postgres are untouched. The table's
-- owned sequence is revoked too (0077 precedent: a usable sequence still leaks
-- how many rows exist).
--
-- SAFETY: a pure grant repair with no column or policy change, so it is
-- order-independent. It is safe to apply before or after the code that ships
-- with it (.claude/rules/migration-safety.md).
--
-- Idempotent: REVOKE of an absent privilege is a no-op.
--
-- Keep in sync with DATA_API_REVOKED_TENANT_TABLES in
-- packages/db/src/schema/rls-config.ts and with
-- scripts/sql/local-supabase-post-migrate.sql.

DO $$
DECLARE
  t text := 'compliance_audit_log';
  s text;
BEGIN
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);

  FOR s IN
    SELECT seq.relname
      FROM pg_depend d
      JOIN pg_class seq ON seq.oid = d.objid AND seq.relkind = 'S'
      JOIN pg_namespace n ON n.oid = seq.relnamespace
     WHERE d.refobjid = format('public.%I', t)::regclass
       AND d.deptype IN ('a', 'i')
       AND n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', s);
  END LOOP;
END $$;
