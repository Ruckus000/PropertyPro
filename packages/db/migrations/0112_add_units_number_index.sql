-- Migration 0112: B-tree index on units.unit_number for resident search prefix matching
CREATE INDEX idx_units_number_btree ON units (unit_number);
