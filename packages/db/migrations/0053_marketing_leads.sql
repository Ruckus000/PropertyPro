CREATE TABLE "marketing_leads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"association_name" text,
	"contact_name" text,
	"association_type" text,
	"unit_count" integer,
	"obligation_required" text,
	"source" text DEFAULT 'compliance_checker' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_leads_status_check" CHECK ("marketing_leads"."status" IN ('new','contacted','qualified','disqualified'))
);
--> statement-breakpoint
CREATE INDEX "marketing_leads_email_idx" ON "marketing_leads" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "marketing_leads_created_idx" ON "marketing_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "marketing_leads_status_idx" ON "marketing_leads" USING btree ("status","created_at");--> statement-breakpoint

-- RLS: marketing_leads is PLATFORM-LEVEL, not tenant-scoped.
--
-- A lead has no community yet — that is the entire point of the table — so there
-- is no community_id, no tenant policy, and no enforce_community_scope trigger.
-- The posture is instead the same deny-everyone lockdown applied to the other
-- platform-identity tables in 0038 (users, pending_signups,
-- stripe_webhook_events): RLS enabled + forced with ZERO policies, all grants
-- revoked from anon/authenticated, service_role only.
--
-- Zero policies IS the deny-everyone default, not an oversight.
--
-- Why this is safe for the two legitimate callers:
--   * The public capture route (POST /api/v1/public/leads) writes through the
--     app's privileged Drizzle connection (DATABASE_URL → `postgres`), which has
--     rolbypassrls. BYPASSRLS outranks FORCE, so writes are unaffected.
--   * The admin console reads via createAdminTypedClient() → service_role, which
--     likewise bypasses RLS.
-- The anon key ships in the browser bundle and this table holds contact details
-- (email, name, association), so leaving the vestigial Supabase grants in place
-- would expose the entire prospect list to an unauthenticated reader.
ALTER TABLE IF EXISTS "public"."marketing_leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."marketing_leads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE marketing_leads FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE marketing_leads_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE marketing_leads TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE marketing_leads_id_seq TO service_role;
