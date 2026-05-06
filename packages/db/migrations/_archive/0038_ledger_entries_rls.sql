-- WS-65: RLS policies for ledger_entries.
-- Mirrors the tenant CRUD baseline used by other tenant-scoped tables.

DROP POLICY IF EXISTS "pp_tenant_select" ON ledger_entries;
DROP POLICY IF EXISTS "pp_tenant_insert" ON ledger_entries;
DROP POLICY IF EXISTS "pp_tenant_update" ON ledger_entries;
DROP POLICY IF EXISTS "pp_tenant_delete" ON ledger_entries;

CREATE POLICY "pp_tenant_select"
ON ledger_entries
FOR SELECT
USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_tenant_insert"
ON ledger_entries
FOR INSERT
WITH CHECK ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_tenant_update"
ON ledger_entries
FOR UPDATE
USING ("public"."pp_rls_can_access_community"(community_id))
WITH CHECK ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_tenant_delete"
ON ledger_entries
FOR DELETE
USING ("public"."pp_rls_can_access_community"(community_id));

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON ledger_entries;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();
