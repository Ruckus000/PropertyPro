CREATE TABLE "site_publish_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid,
	"change_count" integer DEFAULT 0 NOT NULL,
	"change_labels" jsonb,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_publish_snapshots" ADD CONSTRAINT "site_publish_snapshots_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Cross-schema FK to auth.users, which drizzle cannot express in schema.ts —
-- added here with a DO-block idempotency guard, matching the convention used
-- by user_search_index. ON DELETE SET NULL: deleting a user must not erase the
-- association's publish history, which is the whole point of keeping log rows
-- forever on a statutory site.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_publish_snapshots_actor_user_id_fk'
  ) THEN
    ALTER TABLE "site_publish_snapshots"
      ADD CONSTRAINT "site_publish_snapshots_actor_user_id_fk"
      FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX "site_publish_snapshots_community_published_idx" ON "site_publish_snapshots" USING btree ("community_id","published_at");--> statement-breakpoint
-- RLS: `service_only`, deliberately NOT the `public_read_service_write` family
-- that site_blocks uses.
--
-- site_blocks is read anonymously because the public site renders it. This
-- table is the opposite: `snapshot` holds the full block payload of a past
-- publish, so an anonymous read would hand out site content the association may
-- since have deliberately taken down. Nothing outside the service role has any
-- business reading it — not anon, not authenticated, not admin-tier via RLS
-- (the history ROUTE authorizes admins; the table does not).
--
-- Trigger-exempt for the same reason site_blocks is: every write is
-- service-role (captureSnapshot runs inside publishCommunitySite's transaction
-- via the unscoped client), so there is no authenticated write path for
-- pp_rls_enforce_tenant_community_id() to police.
ALTER TABLE IF EXISTS "public"."site_publish_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."site_publish_snapshots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pp_site_publish_snapshots_service" ON public."site_publish_snapshots" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());
