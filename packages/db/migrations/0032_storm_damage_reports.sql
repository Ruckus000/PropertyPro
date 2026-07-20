CREATE TABLE "storm_damage_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint,
	"reported_by" uuid NOT NULL,
	"occurred_at" timestamp with time zone,
	"location_label" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"photo_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "storm_damage_reports" ADD CONSTRAINT "storm_damage_reports_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storm_damage_reports" ADD CONSTRAINT "storm_damage_reports_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storm_damage_reports" ADD CONSTRAINT "storm_damage_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storm_damage_reports_community_reported_by_idx" ON "storm_damage_reports" USING btree ("community_id","reported_by");--> statement-breakpoint
-- CHECK constraints for the text-modeled vocabularies (text + CHECK so the value
-- sets can evolve without an enum rebuild). Mirror the constants in
-- packages/db/src/schema/storm-damage-reports.ts.
ALTER TABLE "storm_damage_reports" ADD CONSTRAINT "storm_damage_reports_category_check"
  CHECK ("category" IN ('roof', 'water', 'structural', 'exterior', 'common_area', 'other'));--> statement-breakpoint
ALTER TABLE "storm_damage_reports" ADD CONSTRAINT "storm_damage_reports_severity_check"
  CHECK ("severity" IN ('minor', 'moderate', 'severe'));--> statement-breakpoint
ALTER TABLE "storm_damage_reports" ADD CONSTRAINT "storm_damage_reports_status_check"
  CHECK ("status" IN ('submitted', 'acknowledged', 'closed'));--> statement-breakpoint
-- storm_damage_reports: `tenant_user_scoped` family — SELECT/UPDATE/DELETE
-- scoped to reported_by = auth.uid() for non-admins (admin-tier sees all);
-- INSERT is community-membership-scoped (pp_tenant_insert) so residents can
-- create their own reports. Copied verbatim from insurance_certificate_requests
-- (requested_by → reported_by). The pp_rls_enforce_tenant_community_id() BEFORE
-- trigger stamps community_id from the session GUC (app.current_community_id).
ALTER TABLE IF EXISTS "public"."storm_damage_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."storm_damage_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."storm_damage_reports";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.storm_damage_reports FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
CREATE POLICY "pp_storm_damage_reports_select" ON public."storm_damage_reports" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (reported_by = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_storm_damage_reports_update" ON public."storm_damage_reports" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (reported_by = auth.uid())))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (reported_by = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_storm_damage_reports_delete" ON public."storm_damage_reports" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (reported_by = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_tenant_insert" ON public."storm_damage_reports" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));