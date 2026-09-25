-- 0077_revoke_data_api_tenant_tables
--
-- WHY: close the Supabase Data API as a door into tenant tables.
--
-- Supabase's baseline grants ALL on every `public` table to anon and
-- authenticated (see 0035's header), so RLS is the only gate on the Data API
-- (PostgREST / pg_graphql). Every table below has a SELECT policy,
-- `pp_tenant_select`, that is merely
--
--     USING (pp_rls_can_access_community(community_id))
--
-- i.e. "the caller holds ANY user_roles row in this community". A tenant who
-- takes their own session JWT and the public anon key can call
-- `GET /rest/v1/<table>?community_id=eq.<theirs>` and read every row. The
-- application's RBAC (requirePermission, isAdminRole, document category access,
-- the AZ-01 leases gate, the units rent redaction) never runs on that path.
-- Rows this exposed to any member, measured against production 2026-09-25:
--
--   * accounting_connections.access_token / refresh_token: the association's
--     accounting-provider OAuth credentials.
--   * calendar_sync_tokens.access_token / refresh_token: OTHER users' Google
--     Calendar credentials.
--   * invitations.token: unconsumed invite tokens addressed to other people.
--   * election_ballot_submissions: submitted_by_user_id + unit_id + voter_hash
--     for every ballot, in a feature whose statute (§718.128) requires a
--     secret ballot.
--   * leases / units / rent_obligations / rent_payments / ledger_entries: every
--     neighbour's rent and balance (how this was found, PR #1174).
--   * documents: including categories the RBAC matrix hides from tenants.
--
-- The write policies were reachable the same way: announcements, for one, admit
-- member INSERT under the default community setting, which on this path skips
-- the route's validation and logAuditEvent.
--
-- WHY REVOKE RATHER THAN TIGHTEN 57 POLICIES: nothing in the application reads
-- or writes these tables as `authenticated`. Tenant queries go through
-- createScopedClient (Drizzle on a role pp_rls_is_privileged() accepts), and
-- every supabase-js `.from()` on a tenant table uses the service-role admin
-- client. The only user-JWT database traffic is auth, the Realtime subscription
-- on `notifications`, and the two SECURITY DEFINER `pp_public_community_id_by_*`
-- RPCs, none of which touch a table below. Verified by grep over apps/*/src and
-- packages/*/src, and in production: there are no public views, `notifications`
-- is the only table in the supabase_realtime publication, and the only
-- storage.objects policies that subquery a public table read `user_roles`, which
-- is why that table is narrowed below instead of revoked. The only
-- SECURITY INVOKER helpers used in any policy (pp_rls_can_access_community,
-- pp_rls_is_privileged) read no table.
--
-- So for these tables the Data API grant is pure attack surface, and the ACL is
-- the right control: no predicate to get wrong, and it shuts the write side and
-- pg_graphql too. 0035/0037/0038/0068/0072 already took this posture for
-- platform tables; this extends it to tenant tables. The RLS policies stay as
-- defence-in-depth for the day a grant is reopened.
--
-- Only anon and authenticated are revoked. service_role is deliberately NOT
-- re-granted (unlike 0035): these tables keep whatever service_role grant they
-- already have, and a blanket re-grant could widen a deliberately narrow one.
-- Owned sequences are revoked too: the baseline's ALTER DEFAULT PRIVILEGES
-- grants ALL ON SEQUENCES, and a usable sequence still leaks how many rows exist
-- when the table is shut (0053/0072 precedent).
--
-- SAFETY: a pure grant/policy repair with no column changes, so it is
-- order-independent. It is safe to apply before or after the code that ships
-- with it (.claude/rules/migration-safety.md).
--
-- Idempotent: REVOKE of an absent privilege is a no-op, and the user_roles
-- policy is dropped IF EXISTS before being recreated.
--
-- Keep the table list in sync with DATA_API_REVOKED_TENANT_TABLES in
-- packages/db/src/schema/rls-config.ts and with
-- scripts/sql/local-supabase-post-migrate.sql.

DO $$
DECLARE
  t text;
  s text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'access_requests', 'accounting_connections', 'amenities',
    'amenity_reservations', 'announcements', 'arc_submissions',
    'assessment_line_items', 'assessments', 'calendar_sync_tokens',
    'community_join_requests', 'compliance_checklist_items', 'contract_bids',
    'contracts', 'document_categories', 'document_drafts', 'documents',
    'election_ballot_submissions', 'election_ballots', 'election_candidates',
    'election_eligibility_snapshots', 'election_proxies', 'elections',
    'esign_consent', 'esign_events', 'esign_signers', 'esign_submissions',
    'esign_templates', 'faqs', 'finance_stripe_webhook_events', 'forum_replies',
    'forum_threads', 'help_article_feedback', 'help_article_views',
    'insurance_policies', 'invitations', 'leases', 'ledger_entries',
    'maintenance_comments', 'meeting_documents', 'meetings', 'move_checklists',
    'onboarding_wizard_state', 'package_log', 'polls', 'rent_obligations',
    'rent_payments', 'reserve_assets', 'stripe_connected_accounts',
    'support_access_log', 'support_consent_grants', 'units', 'vendors',
    'violation_fines', 'violations', 'visitor_log', 'wind_mitigation_reports',
    'work_orders'
  ]
  LOOP
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
  END LOOP;
END $$;--> statement-breakpoint

-- user_roles cannot be revoked: the community-site-assets storage policies
-- (site_assets_pm_insert / site_assets_pm_delete on storage.objects) subquery it
-- as `authenticated` to find the caller's OWN manager rows. Its SELECT policy is
-- narrowed instead, from "any member reads every member's role row" to "your own
-- rows, or every row in a community you manage". That is exactly what those
-- storage policies need. Every pp_rls_* helper that reads user_roles is
-- SECURITY DEFINER, so none of them depends on this policy.
DROP POLICY IF EXISTS "pp_tenant_select" ON public."user_roles";--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."user_roles" AS PERMISSIVE FOR SELECT TO public
  USING (
    pp_rls_is_privileged()
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR pp_rls_can_read_audit_log(community_id)
  );
