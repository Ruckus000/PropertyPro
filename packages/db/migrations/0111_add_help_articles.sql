-- Migration 0111: Create help_articles table for the Help Center
-- Platform articles (community_id IS NULL) are visible to all authenticated users.
-- Community articles are scoped via RLS.

CREATE TABLE help_articles (
  id bigserial PRIMARY KEY,
  community_id bigint REFERENCES communities(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('platform', 'community')),
  is_system boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  summary text NOT NULL,
  body text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  audience text NOT NULL CHECK (audience IN ('resident', 'admin', 'all')),
  category text NOT NULL,
  compliance_note text,
  registry_item_id text,
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Partial unique index: one help article per registry item for cross-referencing
CREATE UNIQUE INDEX idx_help_articles_registry_item
  ON help_articles (registry_item_id)
  WHERE registry_item_id IS NOT NULL AND deleted_at IS NULL;

-- RLS policies
ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_articles FORCE ROW LEVEL SECURITY;

-- Read: authenticated users see platform articles + their own community articles
CREATE POLICY help_articles_read ON help_articles
  FOR SELECT TO authenticated USING (
    community_id IS NULL
    OR community_id = current_setting('app.community_id', true)::bigint
  );

-- Write: community admins can manage community-sourced articles for their community
CREATE POLICY help_articles_community_write ON help_articles
  FOR ALL TO authenticated USING (
    source = 'community'
    AND community_id = current_setting('app.community_id', true)::bigint
  );

-- Service role bypass (consistent with existing table patterns)
CREATE POLICY help_articles_service_role ON help_articles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
