-- notice_consent: owner consent to receive association notices electronically
-- (§718.112(2)(d) condos, §720.303 HOAs).
--
-- WHY: the statutes let an association send notice by email only to an owner
-- who consented in writing, and the owner may withdraw. Nothing recorded that.
-- This is a record only — no notice path reads it.
--
-- SAFETY: pure EXPAND — a new table, nothing existing is altered.
-- ---------------------------------------------------------------------------
CREATE TABLE "notice_consent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_text" text NOT NULL,
	"consent_version" text NOT NULL,
	"email" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notice_consent" ADD CONSTRAINT "notice_consent_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_consent" ADD CONSTRAINT "notice_consent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notice_consent_active_uq" ON "notice_consent" USING btree ("community_id","user_id") WHERE "notice_consent"."revoked_at" is null and "notice_consent"."deleted_at" is null;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS + grants. A consent is the owner's own act: only the owner may create or
-- withdraw it (a manager cannot consent on an owner's behalf), and the
-- manager tier may read every row in its community. No authenticated DELETE —
-- history is append-only; a withdrawal is an UPDATE of revoked_at. The app
-- writes as a privileged role and gates in the route, so these policies are
-- the backstop, and Data API grants are revoked outright, sequence included.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."notice_consent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."notice_consent" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE notice_consent FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE notice_consent_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notice_consent TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE notice_consent_id_seq TO service_role;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."notice_consent";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.notice_consent FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
DROP POLICY IF EXISTS "pp_notice_consent_select" ON public."notice_consent";--> statement-breakpoint
CREATE POLICY "pp_notice_consent_select" ON public."notice_consent" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid()))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_notice_consent_insert" ON public."notice_consent";--> statement-breakpoint
CREATE POLICY "pp_notice_consent_insert" ON public."notice_consent" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (user_id = auth.uid())));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_notice_consent_update" ON public."notice_consent";--> statement-breakpoint
CREATE POLICY "pp_notice_consent_update" ON public."notice_consent" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (user_id = auth.uid())))
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (user_id = auth.uid())));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_notice_consent_delete" ON public."notice_consent";--> statement-breakpoint
CREATE POLICY "pp_notice_consent_delete" ON public."notice_consent" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged());--> statement-breakpoint

COMMENT ON TABLE "notice_consent" IS
  'Owner consent to electronic notice (§718.112(2)(d), §720.303). Append-only history: withdraw stamps revoked_at, re-consent inserts. A record only; no notice path reads it.';
