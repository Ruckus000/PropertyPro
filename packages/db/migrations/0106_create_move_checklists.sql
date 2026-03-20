-- Move-in / move-out checklists for apartment communities.
-- Orchestrates lease onboarding/offboarding steps with e-sign, maintenance, and invitation integrations.

CREATE TABLE move_checklists (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  lease_id bigint NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  unit_id bigint NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  resident_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('move_in', 'move_out')),
  checklist_data jsonb NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Indexes
CREATE INDEX idx_move_checklists_community ON move_checklists(community_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_move_checklists_lease ON move_checklists(lease_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_move_checklists_lease_type ON move_checklists(lease_id, type) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE move_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE move_checklists FORCE ROW LEVEL SECURITY;

CREATE POLICY move_checklists_service_bypass ON move_checklists
  FOR ALL
  USING (pp_rls_is_privileged());

CREATE POLICY move_checklists_community_read ON move_checklists
  FOR SELECT
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY move_checklists_community_insert ON move_checklists
  FOR INSERT
  WITH CHECK (pp_rls_can_access_community(community_id));

CREATE POLICY move_checklists_community_update ON move_checklists
  FOR UPDATE
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY move_checklists_community_delete ON move_checklists
  FOR DELETE
  USING (pp_rls_can_access_community(community_id));

-- Tenant scope trigger (blocks unscoped mutations)
CREATE TRIGGER move_checklists_tenant_scope
  BEFORE INSERT OR UPDATE ON move_checklists
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();
