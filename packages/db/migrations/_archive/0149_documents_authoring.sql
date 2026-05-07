-- In-app document authoring foundation:
--   1. Adds 'authored' to document_source_type enum (for HTML→PDF authored docs)
--   2. Adds parent_document_id to documents (real version chain replacing
--      title+category name-matching) and backfills existing rows by created_at
--      within (community_id, category_id, title) clusters.
--   3. Creates document_drafts — tenant-scoped editor state for in-progress
--      authored documents. Drafts never appear in the documents listing,
--      never count toward compliance, never appear in feeds. On publish, a
--      draft renders to PDF + source HTML in Supabase Storage and inserts a
--      normal documents row with source_type='authored'.

-- 1. Extend document_source_type enum.
-- ALTER TYPE ... ADD VALUE must run outside a transaction in some Postgres
-- versions; Drizzle's migrator handles this per-statement. The new value is
-- additive and safe.
ALTER TYPE document_source_type ADD VALUE IF NOT EXISTS 'authored';

-- 2. Real version chain on documents.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS parent_document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_parent_document_id
  ON documents(parent_document_id)
  WHERE deleted_at IS NULL;

-- Backfill: within each (community_id, category_id, title) cluster, chain
-- rows by created_at — oldest is root (parent_document_id NULL), each
-- subsequent row's parent_document_id = the immediately prior row's id.
-- Idempotent: re-running this is a no-op (the WHERE prev_id IS NOT NULL
-- guard plus the existing-value check via COALESCE keeps it safe).
WITH ordered AS (
  SELECT
    id,
    LAG(id) OVER (
      PARTITION BY community_id, category_id, title
      ORDER BY created_at, id
    ) AS prev_id
  FROM documents
  WHERE deleted_at IS NULL
)
UPDATE documents d
SET parent_document_id = o.prev_id
FROM ordered o
WHERE d.id = o.id
  AND o.prev_id IS NOT NULL
  AND d.parent_document_id IS NULL;

-- 3. document_drafts — editor state for authored documents.
CREATE TABLE document_drafts (
  id                    BIGSERIAL PRIMARY KEY,
  community_id          BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title                 TEXT NOT NULL DEFAULT 'Untitled',
  body_html             TEXT NOT NULL DEFAULT '',
  target_category_id    BIGINT REFERENCES document_categories(id) ON DELETE SET NULL,
  target_meeting_id     BIGINT REFERENCES meetings(id) ON DELETE SET NULL,
  source_document_id    BIGINT REFERENCES documents(id) ON DELETE SET NULL,
  cover_sheet_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  letterhead_options    JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_editor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  last_edited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_document_drafts_community
  ON document_drafts(community_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_document_drafts_author
  ON document_drafts(author_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_document_drafts_meeting
  ON document_drafts(target_meeting_id)
  WHERE deleted_at IS NULL AND target_meeting_id IS NOT NULL;

ALTER TABLE document_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY document_drafts_service_bypass ON document_drafts
  FOR ALL
  USING (pp_rls_is_privileged());

CREATE POLICY document_drafts_community_read ON document_drafts
  FOR SELECT
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY document_drafts_community_insert ON document_drafts
  FOR INSERT
  WITH CHECK (pp_rls_can_access_community(community_id));

CREATE POLICY document_drafts_community_update ON document_drafts
  FOR UPDATE
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY document_drafts_community_delete ON document_drafts
  FOR DELETE
  USING (pp_rls_can_access_community(community_id));

CREATE TRIGGER document_drafts_tenant_scope
  BEFORE INSERT OR UPDATE ON document_drafts
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

COMMENT ON TABLE document_drafts IS 'In-progress editor state for in-app authored documents. Soft-deleted on publish; published artifact is a documents row with source_type=''authored''.';
COMMENT ON COLUMN document_drafts.body_html IS 'Sanitized HTML produced by sanitizeAuthoredHtml; never raw editor input.';
COMMENT ON COLUMN document_drafts.source_document_id IS 'Set when re-editing a previously-published authored document; carried into the new documents.parent_document_id on next publish.';
COMMENT ON COLUMN documents.parent_document_id IS 'Self-FK forming the document version chain. NULL = root version. Replaces name-based version matching.';
