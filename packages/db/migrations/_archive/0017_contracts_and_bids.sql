/** P3-52: Contract & Vendor Tracking tables.
 *
 * Creates:
 *   - contract_status enum
 *   - contracts table (vendor contract records, tenant-scoped)
 *   - contract_bids table (bid submissions per contract, embargoed until close date)
 *
 * Additive migration only — no destructive changes to existing tables.
 */

-- Contract status enum
DO $$ BEGIN
  CREATE TYPE "contract_status" AS ENUM ('draft', 'active', 'expired', 'terminated');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Contracts table
CREATE TABLE IF NOT EXISTS "contracts" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "vendor_name" text NOT NULL,
  "description" text,
  "contract_value" numeric(12, 2),
  "start_date" date NOT NULL,
  "end_date" date,
  "document_id" bigint REFERENCES "documents"("id") ON DELETE RESTRICT,
  "compliance_checklist_item_id" bigint REFERENCES "compliance_checklist_items"("id") ON DELETE SET NULL,
  "bidding_closes_at" timestamp with time zone,
  "conflict_of_interest" boolean NOT NULL DEFAULT false,
  "conflict_of_interest_note" text,
  "status" "contract_status" NOT NULL DEFAULT 'active',
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

-- Contract bids table
CREATE TABLE IF NOT EXISTS "contract_bids" (
  "id" bigserial PRIMARY KEY,
  "contract_id" bigint NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "vendor_name" text NOT NULL,
  "bid_amount" numeric(12, 2) NOT NULL,
  "notes" text,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
