-- unit_occupants: household members with no portal login (Directory).
--
-- WHY: a household member (a child, a live-in parent, a caregiver) lives in a
-- unit but cannot sign in, and may have no email or share one. `users.email`
-- is NOT NULL UNIQUE because it is the login identity, so they get their own
-- table instead of loosening sign-in.
--
-- SAFETY: pure EXPAND — a new table, nothing existing is altered.
-- ---------------------------------------------------------------------------
CREATE TABLE "unit_occupants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"is_owner_household" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "unit_occupants" ADD CONSTRAINT "unit_occupants_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupants" ADD CONSTRAINT "unit_occupants_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unit_occupants_community_unit_idx" ON "unit_occupants" USING btree ("community_id","unit_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS + grants. Names, emails and phones of people who never signed up: the
-- app reads and writes as a privileged role and gates on the manager tier, so
-- every policy is manager-tier (pp_rls_can_read_audit_log), and the Data API
-- grants are revoked outright, sequence included (0072's reasoning: a table
-- that looks locked while its sequence stays open still has an INSERT path).
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."unit_occupants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."unit_occupants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE unit_occupants FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE unit_occupants_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE unit_occupants TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE unit_occupants_id_seq TO service_role;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."unit_occupants";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.unit_occupants FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
DROP POLICY IF EXISTS "pp_unit_occupants_select" ON public."unit_occupants";--> statement-breakpoint
CREATE POLICY "pp_unit_occupants_select" ON public."unit_occupants" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_unit_occupants_insert" ON public."unit_occupants";--> statement-breakpoint
CREATE POLICY "pp_unit_occupants_insert" ON public."unit_occupants" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_unit_occupants_update" ON public."unit_occupants";--> statement-breakpoint
CREATE POLICY "pp_unit_occupants_update" ON public."unit_occupants" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)))
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_unit_occupants_delete" ON public."unit_occupants";--> statement-breakpoint
CREATE POLICY "pp_unit_occupants_delete" ON public."unit_occupants" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint

COMMENT ON TABLE "unit_occupants" IS
  'Household members with no portal login, per unit (Directory). Not users: no sign-in, email optional and not unique. Manager-only.';
