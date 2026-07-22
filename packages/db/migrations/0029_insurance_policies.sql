CREATE TABLE "insurance_certificate_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"policy_id" bigint NOT NULL,
	"requested_by" uuid NOT NULL,
	"unit_label" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"loan_number" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"policy_type" text NOT NULL,
	"carrier_name" text NOT NULL,
	"policy_number" text,
	"coverage_summary" text,
	"deductible_summary" text,
	"effective_at" date,
	"expires_at" date NOT NULL,
	"agent_name" text,
	"agent_email" text,
	"agent_phone" text,
	"document_id" bigint,
	"last_alert_band" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "insurance_certificate_requests" ADD CONSTRAINT "insurance_certificate_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_certificate_requests" ADD CONSTRAINT "insurance_certificate_requests_policy_id_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."insurance_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_certificate_requests" ADD CONSTRAINT "insurance_certificate_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insurance_certificate_requests_community_idx" ON "insurance_certificate_requests" USING btree ("community_id","requested_by");--> statement-breakpoint
CREATE INDEX "insurance_policies_community_expires_idx" ON "insurance_policies" USING btree ("community_id","expires_at");--> statement-breakpoint
-- CHECK constraints for the text-modeled vocabularies (text + CHECK so policy
-- forms / statuses can evolve without an enum rebuild). Mirror the constants in
-- packages/db/src/schema/insurance-policies.ts.
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_policy_type_check"
  CHECK ("policy_type" IN ('property', 'wind', 'flood', 'liability', 'umbrella', 'other'));--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_last_alert_band_check"
  CHECK ("last_alert_band" IS NULL OR "last_alert_band" IN ('60_days', '30_days', 'expired'));--> statement-breakpoint
ALTER TABLE "insurance_certificate_requests" ADD CONSTRAINT "insurance_certificate_requests_status_check"
  CHECK ("status" IN ('sent', 'failed'));--> statement-breakpoint
-- insurance_policies: `tenant_admin_write` family (member SELECT via
-- pp_rls_can_access_community; admin-tier writes via pp_rls_can_read_audit_log)
-- — identical posture to wind_mitigation_reports. The route additionally
-- enforces requirePermission('insurance', 'write') and strips policy_number for
-- non-admin readers. The BEFORE trigger stamps community_id from the session GUC.
ALTER TABLE IF EXISTS "public"."insurance_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."insurance_policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."insurance_policies";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."insurance_policies" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));--> statement-breakpoint
CREATE POLICY "pp_insurance_policies_insert" ON public."insurance_policies" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));--> statement-breakpoint
CREATE POLICY "pp_insurance_policies_update" ON public."insurance_policies" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));--> statement-breakpoint
CREATE POLICY "pp_insurance_policies_delete" ON public."insurance_policies" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));--> statement-breakpoint
-- insurance_certificate_requests: `tenant_user_scoped` family — SELECT/UPDATE/
-- DELETE scoped to requested_by = auth.uid() for non-admins (admin-tier sees
-- all); INSERT is community-membership-scoped so owners can create their own.
-- Copied verbatim from maintenance_requests (submitted_by_id → requested_by).
ALTER TABLE IF EXISTS "public"."insurance_certificate_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."insurance_certificate_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."insurance_certificate_requests";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.insurance_certificate_requests FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
CREATE POLICY "pp_insurance_certificate_requests_select" ON public."insurance_certificate_requests" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (requested_by = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_insurance_certificate_requests_update" ON public."insurance_certificate_requests" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (requested_by = auth.uid())))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (requested_by = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_insurance_certificate_requests_delete" ON public."insurance_certificate_requests" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (requested_by = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_tenant_insert" ON public."insurance_certificate_requests" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));