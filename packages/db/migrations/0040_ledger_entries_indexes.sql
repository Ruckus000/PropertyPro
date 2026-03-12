-- WS-65: Supplemental indexes used by balance/report queries.

CREATE INDEX idx_ledger_entries_created_at
  ON ledger_entries(community_id, created_at DESC);

CREATE INDEX idx_ledger_entries_entry_type_date
  ON ledger_entries(community_id, entry_type, effective_date DESC);
