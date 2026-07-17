CREATE TABLE "wind_mitigation_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"document_id" bigint NOT NULL,
	"form_type" text NOT NULL,
	"form_version" text DEFAULT 'pre_2026' NOT NULL,
	"building_label" text,
	"inspected_at" date NOT NULL,
	"expires_at" date NOT NULL,
	"inspector_name" text,
	"inspector_license" text,
	"notes" text,
	"last_alert_band" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wind_mitigation_reports" ADD CONSTRAINT "wind_mitigation_reports_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wind_mitigation_reports" ADD CONSTRAINT "wind_mitigation_reports_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wind_mitigation_reports" ADD CONSTRAINT "wind_mitigation_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wind_mitigation_reports_community_expires_idx" ON "wind_mitigation_reports" USING btree ("community_id","expires_at");--> statement-breakpoint
-- CHECK constraints for the text-modeled vocabularies. Text + CHECK rather than
-- pgEnum on purpose: Florida OIR revises these forms on its own cadence (a new
-- OIR-B1-1802 took effect 2026-04-01), so the value set must be editable without
-- an enum-rebuild migration. Mirrors WIND_MITIGATION_FORM_TYPES /
-- _FORM_VERSIONS / _ALERT_BANDS in packages/db/src/schema/wind-mitigation-reports.ts.
ALTER TABLE "wind_mitigation_reports" ADD CONSTRAINT "wind_mitigation_reports_form_type_check"
  CHECK ("form_type" IN ('oir_b1_1802', 'mit_bt_ii', 'mit_bt_iii'));--> statement-breakpoint
ALTER TABLE "wind_mitigation_reports" ADD CONSTRAINT "wind_mitigation_reports_form_version_check"
  CHECK ("form_version" IN ('pre_2026', '2026_04'));--> statement-breakpoint
ALTER TABLE "wind_mitigation_reports" ADD CONSTRAINT "wind_mitigation_reports_last_alert_band_check"
  CHECK ("last_alert_band" IS NULL OR "last_alert_band" IN ('180_days', '90_days', '30_days', 'expired'));--> statement-breakpoint
-- wind_mitigation_reports is a tenant table in the `tenant_admin_write` family.
-- SELECT is open to every community member on purpose: the entire value of the
-- feature is that unit owners retrieve the building's wind-mitigation report to
-- hand to their own HO-6/wind insurer for mitigation credits (§627.0629).
-- Writes are admin-tier (pp_rls_can_read_audit_log — the admin-tier-or-platform-admin
-- class), matching the `contracts` posture; the route layer additionally enforces
-- requirePermission('insurance', 'write'). The pp_rls_enforce_tenant_community_id()
-- BEFORE trigger stamps community_id from the session GUC (app.current_community_id)
-- for any non-privileged write.
ALTER TABLE IF EXISTS "public"."wind_mitigation_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."wind_mitigation_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."wind_mitigation_reports";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.wind_mitigation_reports FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."wind_mitigation_reports" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));--> statement-breakpoint
CREATE POLICY "pp_wind_mitigation_reports_insert" ON public."wind_mitigation_reports" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));--> statement-breakpoint
CREATE POLICY "pp_wind_mitigation_reports_update" ON public."wind_mitigation_reports" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));--> statement-breakpoint
CREATE POLICY "pp_wind_mitigation_reports_delete" ON public."wind_mitigation_reports" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));