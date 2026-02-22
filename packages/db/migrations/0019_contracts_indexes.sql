/** P3-52 hardening: add missing indexes to contracts and contract_bids tables.
 *
 * Additive migration only — no schema changes, just CREATE INDEX IF NOT EXISTS.
 * Partial indexes exclude soft-deleted rows (WHERE deleted_at IS NULL) to match
 * the scoped client's automatic soft-delete filter.
 */

-- contracts: every scoped query filters on community_id
CREATE INDEX IF NOT EXISTS "contracts_community_id_idx"
  ON "contracts" USING btree ("community_id")
  WHERE "deleted_at" IS NULL;

-- contracts: embargo checks filter on bidding_closes_at
CREATE INDEX IF NOT EXISTS "contracts_bidding_closes_at_idx"
  ON "contracts" USING btree ("bidding_closes_at")
  WHERE "deleted_at" IS NULL;

-- contract_bids: every scoped query filters on community_id
CREATE INDEX IF NOT EXISTS "contract_bids_community_id_idx"
  ON "contract_bids" USING btree ("community_id")
  WHERE "deleted_at" IS NULL;

-- contract_bids: bid grouping/joins filter on contract_id
CREATE INDEX IF NOT EXISTS "contract_bids_contract_id_idx"
  ON "contract_bids" USING btree ("contract_id")
  WHERE "deleted_at" IS NULL;
