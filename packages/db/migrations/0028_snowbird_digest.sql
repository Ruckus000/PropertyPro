CREATE TABLE "snowbird_digest_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "snowbird_digest_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "snowbird_digest_subscriptions" ADD CONSTRAINT "snowbird_digest_subscriptions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snowbird_digest_subscriptions" ADD CONSTRAINT "snowbird_digest_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "snowbird_digest_subscriptions_user_community_unique" ON "snowbird_digest_subscriptions" USING btree ("community_id","user_id") WHERE "snowbird_digest_subscriptions"."deleted_at" IS NULL;--> statement-breakpoint
-- Cadence vocabulary — text + CHECK (mirrors SNOWBIRD_DIGEST_CADENCES in
-- packages/db/src/schema/snowbird-digest-subscriptions.ts).
ALTER TABLE "snowbird_digest_subscriptions" ADD CONSTRAINT "snowbird_digest_subscriptions_cadence_check"
  CHECK ("cadence" IN ('weekly', 'monthly', 'off'));--> statement-breakpoint
-- snowbird_digest_subscriptions is a tenant table in the `tenant_user_scoped`
-- family: a user reads and mutates ONLY their own row (user_id = auth.uid());
-- admin-tier (pp_rls_can_read_audit_log) sees all for support; the cron uses
-- the privileged client. Policy shape copied verbatim from
-- notification_preferences. The pp_rls_enforce_tenant_community_id() BEFORE
-- trigger stamps community_id from the session GUC for non-privileged writes.
ALTER TABLE IF EXISTS "public"."snowbird_digest_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."snowbird_digest_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."snowbird_digest_subscriptions";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.snowbird_digest_subscriptions FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
CREATE POLICY "pp_snowbird_digest_subscriptions_select" ON public."snowbird_digest_subscriptions" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_snowbird_digest_subscriptions_insert" ON public."snowbird_digest_subscriptions" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_snowbird_digest_subscriptions_update" ON public."snowbird_digest_subscriptions" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));--> statement-breakpoint
CREATE POLICY "pp_snowbird_digest_subscriptions_delete" ON public."snowbird_digest_subscriptions" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));