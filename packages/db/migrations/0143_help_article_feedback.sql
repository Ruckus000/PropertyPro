-- Help article feedback + view events.
-- Captures both user feedback (thumbs up/down + optional comment) and lightweight
-- view analytics so content authors can see which articles are working.
--
-- Both tables are community-scoped so PMs managing multiple communities can see
-- per-community patterns, but article_slug/category are stored as free text because
-- articles are MDX files on disk, not DB rows.

-- 1. help_article_feedback — one row per rating submission
CREATE TABLE help_article_feedback (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_slug  TEXT NOT NULL,
  article_category TEXT NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_help_article_feedback_community_article
  ON help_article_feedback(community_id, article_slug)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_help_article_feedback_user
  ON help_article_feedback(user_id)
  WHERE deleted_at IS NULL;

-- A user should only have one active feedback row per article (their latest rating).
CREATE UNIQUE INDEX idx_help_article_feedback_user_article_unique
  ON help_article_feedback(user_id, article_slug)
  WHERE deleted_at IS NULL;

ALTER TABLE help_article_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_article_feedback FORCE ROW LEVEL SECURITY;

CREATE POLICY help_article_feedback_service_bypass ON help_article_feedback
  FOR ALL
  USING (pp_rls_is_privileged());

CREATE POLICY help_article_feedback_community_read ON help_article_feedback
  FOR SELECT
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY help_article_feedback_community_insert ON help_article_feedback
  FOR INSERT
  WITH CHECK (pp_rls_can_access_community(community_id));

CREATE POLICY help_article_feedback_community_update ON help_article_feedback
  FOR UPDATE
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY help_article_feedback_community_delete ON help_article_feedback
  FOR DELETE
  USING (pp_rls_can_access_community(community_id));

CREATE TRIGGER help_article_feedback_tenant_scope
  BEFORE INSERT OR UPDATE ON help_article_feedback
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

-- 2. help_article_views — append-only view log for analytics
CREATE TABLE help_article_views (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_slug  TEXT NOT NULL,
  article_category TEXT NOT NULL,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_article_views_community_article
  ON help_article_views(community_id, article_slug);

CREATE INDEX idx_help_article_views_viewed_at
  ON help_article_views(viewed_at DESC);

ALTER TABLE help_article_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_article_views FORCE ROW LEVEL SECURITY;

CREATE POLICY help_article_views_service_bypass ON help_article_views
  FOR ALL
  USING (pp_rls_is_privileged());

CREATE POLICY help_article_views_community_read ON help_article_views
  FOR SELECT
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY help_article_views_community_insert ON help_article_views
  FOR INSERT
  WITH CHECK (pp_rls_can_access_community(community_id));

CREATE TRIGGER help_article_views_tenant_scope
  BEFORE INSERT OR UPDATE ON help_article_views
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

COMMENT ON TABLE help_article_feedback IS 'User thumbs up/down and optional comment per help article';
COMMENT ON TABLE help_article_views IS 'Append-only log of help article page views';
