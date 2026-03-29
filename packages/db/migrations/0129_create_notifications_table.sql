-- Migration 0129: Create notifications table with RLS and Realtime publication

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"           bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id"      uuid   NOT NULL REFERENCES "users"("id")       ON DELETE CASCADE,
  "category"     text   NOT NULL,
  "title"        text   NOT NULL,
  "body"         text,
  "action_url"   text,
  "source_type"  text   NOT NULL,
  "source_id"    text   NOT NULL,
  "priority"     text   NOT NULL DEFAULT 'normal',
  "read_at"      timestamptz,
  "archived_at"  timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "deleted_at"   timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS "notifications_feed_idx"
  ON "notifications" ("community_id", "user_id", "archived_at", "deleted_at", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_unread_idx"
  ON "notifications" ("community_id", "user_id", "read_at")
  WHERE "read_at" IS NULL AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_unique"
  ON "notifications" ("community_id", "user_id", "source_type", "source_id");

-- Tenant write-scope trigger (matches pattern from migration 0020)
CREATE TRIGGER "notifications_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

-- Row Level Security
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

-- SELECT: users see only their own notifications
CREATE POLICY "notifications_user_select"
  ON "notifications" FOR SELECT
  USING ("user_id" = auth.uid());

-- UPDATE: users can mark their own as read/archived
CREATE POLICY "notifications_user_update"
  ON "notifications" FOR UPDATE
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());

-- INSERT/DELETE: no client policy — service_role bypasses RLS for inserts
-- (app server connects as postgres/service_role which has BYPASSRLS)

-- Realtime publication: enables Supabase Realtime Postgres Changes on this table
ALTER PUBLICATION "supabase_realtime" ADD TABLE "notifications";
