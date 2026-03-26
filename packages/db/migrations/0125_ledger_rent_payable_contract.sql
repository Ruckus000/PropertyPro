-- Extend ledger enum constraints for rent payable support.
-- This is additive and backward-compatible with assessment behavior.

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (
    entry_type IN (
      'assessment',
      'rent',
      'payment',
      'refund',
      'fine',
      'fee',
      'adjustment'
    )
  );

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_source_type_check
  CHECK (
    source_type IN (
      'assessment',
      'rent',
      'payment',
      'violation',
      'manual'
    )
  );
