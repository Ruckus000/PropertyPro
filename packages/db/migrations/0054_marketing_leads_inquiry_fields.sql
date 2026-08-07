-- Inbound-inquiry fields for marketing_leads.
--
-- Both columns are nullable, so this is an EXPAND migration: safe to apply
-- before the code that writes them ships.
--
-- `message` is a separate column rather than a reuse of `notes` for a security
-- reason. The capture endpoints are UNAUTHENTICATED and upsert on normalized
-- email, so anyone who knows a lead's address can write to that row. `notes` is
-- sales-owned and the capture service never touches it; routing prospect prose
-- there would let a stranger overwrite triage notes a human had already written.
--
-- `community_count` is separate from `unit_count` for a correctness reason: the
-- admin console reads a `unit_count` of 25–149 as the ICP band, so a
-- 40-community portfolio stored there would read as a textbook self-managed
-- condo.
--
-- No RLS work needed — 0050 put this table under a deny-everyone posture (RLS
-- enabled + forced, zero policies, service_role grants only), which covers new
-- columns automatically.
ALTER TABLE "marketing_leads" ADD COLUMN "community_count" integer;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD CONSTRAINT "marketing_leads_community_count_check" CHECK ("marketing_leads"."community_count" IS NULL OR ("marketing_leads"."community_count" > 0 AND "marketing_leads"."community_count" <= 10000));