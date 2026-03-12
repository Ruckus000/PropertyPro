-- WS-65: Shared ledger table foundation for Phase 5 workstreams.
-- Supports assessments/payments (WS-66) and fines/fees (WS-67).

CREATE TABLE ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  description TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  unit_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_community ON ledger_entries(community_id);
CREATE INDEX idx_ledger_entries_unit ON ledger_entries(unit_id);
CREATE INDEX idx_ledger_entries_source ON ledger_entries(source_type, source_id);
CREATE INDEX idx_ledger_entries_effective_date ON ledger_entries(community_id, effective_date);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
