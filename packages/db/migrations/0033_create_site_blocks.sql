-- Site blocks for public site builder
CREATE TABLE site_blocks (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities ON DELETE CASCADE,
  block_order int NOT NULL,
  block_type text NOT NULL CHECK (block_type IN (
    'hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image'
  )),
  content jsonb NOT NULL DEFAULT '{}',
  is_draft boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, block_order, is_draft)
);

CREATE INDEX idx_site_blocks_community_order ON site_blocks(community_id, block_order);
CREATE INDEX idx_site_blocks_community_draft ON site_blocks(community_id, is_draft);

ALTER TABLE site_blocks ENABLE ROW LEVEL SECURITY;

-- service_role has full access
CREATE POLICY site_blocks_service_role ON site_blocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated users can read published blocks for their community
CREATE POLICY site_blocks_read_published ON site_blocks
  FOR SELECT TO authenticated
  USING (is_draft = false AND community_id = current_setting('app.community_id')::bigint);

-- anon can read published blocks (for public site rendering)
CREATE POLICY site_blocks_anon_read ON site_blocks
  FOR SELECT TO anon
  USING (is_draft = false);

-- Add site columns to communities
ALTER TABLE communities ADD COLUMN custom_domain text;
ALTER TABLE communities ADD COLUMN site_published_at timestamptz;

COMMENT ON TABLE site_blocks IS 'Blocks for community public site pages. Draft/published workflow.';
