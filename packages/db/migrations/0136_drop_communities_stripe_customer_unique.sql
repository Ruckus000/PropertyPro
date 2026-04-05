ALTER TABLE "communities"
  DROP CONSTRAINT IF EXISTS "communities_stripe_customer_id_unique";

CREATE INDEX IF NOT EXISTS "idx_communities_stripe_customer_id"
  ON "communities" ("stripe_customer_id");
