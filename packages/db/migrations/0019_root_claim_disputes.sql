CREATE TABLE "root_claim_disputes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"claimed_user_id" uuid NOT NULL,
	"disputed_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "root_claim_disputes" ADD CONSTRAINT "root_claim_disputes_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_claim_disputes" ADD CONSTRAINT "root_claim_disputes_claimed_user_id_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_claim_disputes" ADD CONSTRAINT "root_claim_disputes_disputed_by_user_id_users_id_fk" FOREIGN KEY ("disputed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_claim_disputes" ADD CONSTRAINT "root_claim_disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- root_claim_disputes is a tenant table (community_id) but an ADMIN-ONLY queue:
-- it is NOT resident-facing. Reads are gated on pp_rls_can_read_audit_log
-- (admin-tier-or-platform-admin, bilingual since 0016) — exactly the read class
-- this dispute queue belongs to. Writes (INSERT/UPDATE) flow through the
-- privileged `db` connection in the service layer, same posture as
-- compliance_audit_log. The pp_rls_enforce_tenant_community_id() BEFORE trigger
-- stamps community_id from the session context for any non-privileged write.
ALTER TABLE IF EXISTS "public"."root_claim_disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."root_claim_disputes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."root_claim_disputes";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.root_claim_disputes FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
CREATE POLICY "pp_root_claim_disputes_insert" ON public."root_claim_disputes" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());--> statement-breakpoint
CREATE POLICY "pp_root_claim_disputes_select" ON public."root_claim_disputes" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_read_audit_log(community_id));
