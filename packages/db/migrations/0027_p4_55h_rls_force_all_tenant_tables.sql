-- P4-55h: Apply FORCE ROW LEVEL SECURITY to all tenant-scoped tables.
--
-- Addresses Gemini PR#14 finding: FORCE ROW LEVEL SECURITY was applied to the
-- communities table in migration 0026, but was not applied to the 21 tables
-- RLS-enabled in migration 0020. Without FORCE, the PostgreSQL table owner role
-- (typically `postgres`) bypasses RLS by default, undermining the defense-in-depth
-- model even when policies are otherwise correct.
--
-- FORCE ROW LEVEL SECURITY does not alter policy logic or change access for
-- application roles — it only closes the owner-bypass loophole.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      -- 16 tenant CRUD tables (RLS enabled in 0020)
      'announcements',
      'compliance_checklist_items',
      'contract_bids',
      'contracts',
      'document_categories',
      'documents',
      'invitations',
      'leases',
      'maintenance_comments',
      'maintenance_requests',
      'meeting_documents',
      'meetings',
      'notification_preferences',
      'onboarding_wizard_state',
      'units',
      'user_roles',
      -- 4 service-only/system-managed tables (RLS enabled in 0020)
      'announcement_delivery_log',
      'demo_seed_registry',
      'notification_digest_queue',
      'provisioning_jobs',
      -- 1 audit table (RLS enabled in 0020)
      'compliance_audit_log'
    ]::text[])
  LOOP
    EXECUTE format('ALTER TABLE "public".%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
