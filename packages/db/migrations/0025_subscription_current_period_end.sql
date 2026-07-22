ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "subscription_current_period_end_at" timestamp with time zone;
