-- WS-68: Polls and community board schema.

CREATE TABLE polls (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  poll_type TEXT NOT NULL,
  options JSONB NOT NULL,
  ends_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT polls_poll_type_check CHECK (poll_type IN ('single_choice', 'multiple_choice')),
  CONSTRAINT polls_options_is_array CHECK (jsonb_typeof(options) = 'array')
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls FORCE ROW LEVEL SECURITY;

CREATE TABLE poll_votes (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_options JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT poll_votes_selected_options_is_array CHECK (jsonb_typeof(selected_options) = 'array'),
  CONSTRAINT poll_votes_unique_poll_user UNIQUE (poll_id, user_id)
);

ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes FORCE ROW LEVEL SECURITY;

CREATE TABLE forum_threads (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_threads FORCE ROW LEVEL SECURITY;

CREATE TABLE forum_replies (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  thread_id BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'polls',
      'forum_threads',
      'forum_replies'
    ]::text[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_select" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_insert" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_update" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_delete" ON "public".%I', table_name);

    EXECUTE format(
      'CREATE POLICY "pp_tenant_select" ON "public".%I FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_insert" ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_update" ON "public".%I FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id")) WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_delete" ON "public".%I FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );

    EXECUTE format('DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public".%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER "pp_rls_enforce_tenant_scope" BEFORE INSERT OR UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"()',
      table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "pp_poll_votes_select" ON "public".poll_votes;
DROP POLICY IF EXISTS "pp_poll_votes_insert" ON "public".poll_votes;
DROP POLICY IF EXISTS "pp_poll_votes_update" ON "public".poll_votes;
DROP POLICY IF EXISTS "pp_poll_votes_delete" ON "public".poll_votes;

CREATE POLICY "pp_poll_votes_select"
  ON "public".poll_votes
  FOR SELECT
  USING (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_is_privileged"()
      OR "public"."pp_rls_can_read_audit_log"("community_id")
      OR user_id = auth.uid()
    )
  );

CREATE POLICY "pp_poll_votes_insert"
  ON "public".poll_votes
  FOR INSERT
  WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
    AND (
      "public"."pp_rls_is_privileged"()
      OR user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public".poll_votes;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "public".poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

CREATE INDEX idx_polls_community_active
  ON polls(community_id, is_active, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_polls_community_ends_at
  ON polls(community_id, ends_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_poll_votes_community_poll
  ON poll_votes(community_id, poll_id, created_at DESC);

CREATE INDEX idx_forum_threads_community_created
  ON forum_threads(community_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_forum_replies_community_thread
  ON forum_replies(community_id, thread_id, created_at ASC)
  WHERE deleted_at IS NULL;
