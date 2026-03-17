-- 0101: Elections schema (Phase 1D).
--
-- Creates 5 tables:
--   elections                        - election/ballot measure definitions
--   election_candidates              - candidates or options on a ballot
--   election_ballots                 - immutable append-only vote records
--   election_proxies                 - proxy voting designations
--   election_eligibility_snapshots   - point-in-time eligibility snapshot
--
-- All tables are tenant-scoped with RLS enabled + forced.
-- election_ballots and election_eligibility_snapshots are append-only.

-- ---------------------------------------------------------------------------
-- 1. elections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."elections" (
  "id"                    BIGSERIAL PRIMARY KEY,
  "community_id"          BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "title"                 TEXT NOT NULL,
  "description"           TEXT,
  "election_type"         TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'draft',
  "is_secret_ballot"      BOOLEAN NOT NULL DEFAULT TRUE,
  "ballot_salt"           TEXT NOT NULL,
  "max_selections"        INTEGER NOT NULL DEFAULT 1,
  "opens_at"              TIMESTAMPTZ NOT NULL,
  "closes_at"             TIMESTAMPTZ NOT NULL,
  "quorum_percentage"     INTEGER NOT NULL DEFAULT 50,
  "eligible_unit_count"   INTEGER NOT NULL DEFAULT 0,
  "total_ballots_cast"    INTEGER NOT NULL DEFAULT 0,
  "certified_by_user_id"  UUID REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "certified_at"          TIMESTAMPTZ,
  "results_document_id"   BIGINT REFERENCES "public"."documents"("id") ON DELETE SET NULL,
  "canceled_reason"       TEXT,
  "created_by_user_id"    UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"            TIMESTAMPTZ,
  CONSTRAINT elections_type_check CHECK (
    election_type IN ('board_election', 'budget_approval', 'rule_amendment', 'special_assessment', 'custom')
  ),
  CONSTRAINT elections_status_check CHECK (
    status IN ('draft', 'open', 'closed', 'certified', 'canceled')
  ),
  CONSTRAINT elections_closes_after_opens CHECK (closes_at > opens_at),
  CONSTRAINT elections_quorum_range CHECK (quorum_percentage >= 1 AND quorum_percentage <= 100),
  CONSTRAINT elections_max_selections_positive CHECK (max_selections >= 1)
);

ALTER TABLE "public"."elections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."elections" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_elections_community_status"
  ON "public"."elections" ("community_id", "status");

CREATE INDEX IF NOT EXISTS "idx_elections_community_dates"
  ON "public"."elections" ("community_id", "opens_at", "closes_at");

-- RLS: tenant_admin_write (SELECT on membership; INSERT/UPDATE/DELETE require admin-tier)
CREATE POLICY "pp_tenant_select" ON "public"."elections"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_elections_admin_insert" ON "public"."elections"
  FOR INSERT WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));

CREATE POLICY "pp_elections_admin_update" ON "public"."elections"
  FOR UPDATE
  USING ("public"."pp_rls_can_read_audit_log"("community_id"))
  WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));

CREATE POLICY "pp_elections_admin_delete" ON "public"."elections"
  FOR DELETE USING ("public"."pp_rls_can_read_audit_log"("community_id"));

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."elections";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "public"."elections"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. election_candidates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."election_candidates" (
  "id"              BIGSERIAL PRIMARY KEY,
  "community_id"    BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "election_id"     BIGINT NOT NULL REFERENCES "public"."elections"("id") ON DELETE CASCADE,
  "label"           TEXT NOT NULL,
  "description"     TEXT,
  "user_id"         UUID REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "sort_order"      INTEGER NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"      TIMESTAMPTZ
);

ALTER TABLE "public"."election_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."election_candidates" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_election_candidates_election"
  ON "public"."election_candidates" ("election_id", "sort_order");

-- RLS: tenant_admin_write
CREATE POLICY "pp_tenant_select" ON "public"."election_candidates"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_election_candidates_admin_insert" ON "public"."election_candidates"
  FOR INSERT WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));

CREATE POLICY "pp_election_candidates_admin_update" ON "public"."election_candidates"
  FOR UPDATE
  USING ("public"."pp_rls_can_read_audit_log"("community_id"))
  WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));

CREATE POLICY "pp_election_candidates_admin_delete" ON "public"."election_candidates"
  FOR DELETE USING ("public"."pp_rls_can_read_audit_log"("community_id"));

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."election_candidates";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "public"."election_candidates"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. election_ballots (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."election_ballots" (
  "id"              BIGSERIAL PRIMARY KEY,
  "community_id"    BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "election_id"     BIGINT NOT NULL REFERENCES "public"."elections"("id") ON DELETE CASCADE,
  "candidate_id"    BIGINT NOT NULL REFERENCES "public"."election_candidates"("id") ON DELETE CASCADE,
  "unit_id"         BIGINT NOT NULL REFERENCES "public"."units"("id") ON DELETE CASCADE,
  "voter_hash"      TEXT NOT NULL,
  "is_abstention"   BOOLEAN NOT NULL DEFAULT FALSE,
  "is_proxy_vote"   BOOLEAN NOT NULL DEFAULT FALSE,
  "proxy_id"        BIGINT,
  "cast_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO updated_at, NO deleted_at — append-only / immutable
);

ALTER TABLE "public"."election_ballots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."election_ballots" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_election_ballots_election"
  ON "public"."election_ballots" ("election_id");

CREATE INDEX IF NOT EXISTS "idx_election_ballots_unit"
  ON "public"."election_ballots" ("election_id", "unit_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_election_ballots_unit_candidate"
  ON "public"."election_ballots" ("election_id", "unit_id", "candidate_id");

-- RLS: tenant_append_only (SELECT + INSERT only; no UPDATE/DELETE)
CREATE POLICY "pp_tenant_select" ON "public"."election_ballots"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_election_ballots_insert" ON "public"."election_ballots"
  FOR INSERT WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
  );

-- No UPDATE or DELETE policies — ballots are immutable

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."election_ballots";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT ON "public"."election_ballots"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. election_proxies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."election_proxies" (
  "id"                      BIGSERIAL PRIMARY KEY,
  "community_id"            BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "election_id"             BIGINT NOT NULL REFERENCES "public"."elections"("id") ON DELETE CASCADE,
  "grantor_user_id"         UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "grantor_unit_id"         BIGINT NOT NULL REFERENCES "public"."units"("id") ON DELETE CASCADE,
  "proxy_holder_user_id"    UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "status"                  TEXT NOT NULL DEFAULT 'pending',
  "approved_by_user_id"     UUID REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "approved_at"             TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"              TIMESTAMPTZ,
  CONSTRAINT election_proxies_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'revoked')
  )
);

ALTER TABLE "public"."election_proxies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."election_proxies" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_election_proxies_election"
  ON "public"."election_proxies" ("election_id", "status");

CREATE INDEX IF NOT EXISTS "idx_election_proxies_holder"
  ON "public"."election_proxies" ("proxy_holder_user_id", "election_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_election_proxies_grantor"
  ON "public"."election_proxies" ("election_id", "grantor_unit_id")
  WHERE "deleted_at" IS NULL;

-- RLS: tenant_crud (all ops gated on community membership)
CREATE POLICY "pp_tenant_select" ON "public"."election_proxies"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_insert" ON "public"."election_proxies"
  FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_update" ON "public"."election_proxies"
  FOR UPDATE
  USING ("public"."pp_rls_can_access_community"("community_id"))
  WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_delete" ON "public"."election_proxies"
  FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."election_proxies";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "public"."election_proxies"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. election_eligibility_snapshots (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."election_eligibility_snapshots" (
  "id"                    BIGSERIAL PRIMARY KEY,
  "community_id"          BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "election_id"           BIGINT NOT NULL REFERENCES "public"."elections"("id") ON DELETE CASCADE,
  "unit_id"               BIGINT NOT NULL REFERENCES "public"."units"("id") ON DELETE CASCADE,
  "owner_user_id"         UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "is_eligible"           BOOLEAN NOT NULL DEFAULT TRUE,
  "ineligibility_reason"  TEXT,
  "snapshot_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO updated_at, NO deleted_at — append-only / immutable snapshot
);

ALTER TABLE "public"."election_eligibility_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."election_eligibility_snapshots" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_election_eligibility_election"
  ON "public"."election_eligibility_snapshots" ("election_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_election_eligibility_unit"
  ON "public"."election_eligibility_snapshots" ("election_id", "unit_id");

-- RLS: tenant_append_only (SELECT + INSERT only; no UPDATE/DELETE)
CREATE POLICY "pp_tenant_select" ON "public"."election_eligibility_snapshots"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_election_eligibility_insert" ON "public"."election_eligibility_snapshots"
  FOR INSERT WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
  );

-- No UPDATE or DELETE policies — snapshots are immutable

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."election_eligibility_snapshots";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT ON "public"."election_eligibility_snapshots"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Add proxy_id FK constraint on election_ballots
--    (defined after election_proxies table exists)
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."election_ballots"
  ADD CONSTRAINT "election_ballots_proxy_id_fkey"
  FOREIGN KEY ("proxy_id") REFERENCES "public"."election_proxies"("id") ON DELETE SET NULL;
