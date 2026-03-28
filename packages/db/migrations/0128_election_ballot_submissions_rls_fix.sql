-- Phase 5 elections submission RLS hardening.
--
-- 0126 created election_ballot_submissions with FORCE ROW LEVEL SECURITY but
-- only defined SELECT and INSERT policies. Without UPDATE and DELETE policies
-- the service role is silently blocked from any row maintenance — including
-- GDPR deletion requests and admin data corrections. Add the missing policies
-- matching the project's standard tenant-scoped pattern.

CREATE POLICY "pp_tenant_update" ON "public"."election_ballot_submissions"
  FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"))
  WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_delete" ON "public"."election_ballot_submissions"
  FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));
