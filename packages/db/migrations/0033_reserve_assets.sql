CREATE TABLE "reserve_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"year_installed" integer NOT NULL,
	"useful_life_years" integer NOT NULL,
	"replacement_cost_cents" bigint,
	"current_reserve_cents" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reserve_assets" ADD CONSTRAINT "reserve_assets_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reserve_assets_community_idx" ON "reserve_assets" USING btree ("community_id");--> statement-breakpoint
-- CHECK constraint for the text-modeled category vocabulary. Text + CHECK
-- (not a pgEnum) so the value set can evolve without an enum-rebuild migration.
-- Mirrors RESERVE_ASSET_CATEGORIES in packages/db/src/schema/reserve-assets.ts.
ALTER TABLE "reserve_assets" ADD CONSTRAINT "reserve_assets_category_check"
  CHECK ("category" IN ('roof', 'structure', 'elevator', 'pool', 'paving', 'mechanical', 'exterior', 'other'));--> statement-breakpoint
-- reserve_assets is a tenant table in the `tenant_admin_write` family — the
-- identical posture to wind_mitigation_reports / insurance_policies. SELECT is
-- open to every community member on purpose: the entire value of reserve
-- transparency is that owners see the register + remaining-useful-life
-- countdown. Writes are admin-tier (pp_rls_can_read_audit_log — the
-- admin-tier-or-platform-admin class); the route layer additionally enforces
-- requirePermission('reserve_assets', 'write'). The pp_rls_enforce_tenant_community_id()
-- BEFORE trigger stamps community_id from the session GUC (app.current_community_id)
-- for any non-privileged write. Factual data only — this table never encodes an
-- adequacy assessment.
ALTER TABLE IF EXISTS "public"."reserve_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."reserve_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."reserve_assets";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.reserve_assets FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."reserve_assets" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));--> statement-breakpoint
CREATE POLICY "pp_reserve_assets_insert" ON public."reserve_assets" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));--> statement-breakpoint
CREATE POLICY "pp_reserve_assets_update" ON public."reserve_assets" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));--> statement-breakpoint
CREATE POLICY "pp_reserve_assets_delete" ON public."reserve_assets" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));