-- Migration 0109: Enable pg_trgm extension and add GIN trigram indexes for search
-- Part of Command Palette V2 Phase 2 — Data Search

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- B-tree indexes for tenant filtering (idempotent — skip if already exist)
CREATE INDEX IF NOT EXISTS idx_documents_community ON documents (community_id);
CREATE INDEX IF NOT EXISTS idx_announcements_community ON announcements (community_id);
CREATE INDEX IF NOT EXISTS idx_meetings_community ON meetings (community_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_community ON maintenance_requests (community_id);
CREATE INDEX IF NOT EXISTS idx_violations_community ON violations (community_id);

-- GIN trigram indexes for text search
CREATE INDEX idx_documents_title_trgm ON documents USING gin (title gin_trgm_ops);
CREATE INDEX idx_announcements_title_trgm ON announcements USING gin (title gin_trgm_ops);
CREATE INDEX idx_meetings_title_trgm ON meetings USING gin (title gin_trgm_ops);
CREATE INDEX idx_maintenance_title_trgm ON maintenance_requests USING gin (title gin_trgm_ops);
CREATE INDEX idx_violations_desc_trgm ON violations USING gin (description gin_trgm_ops);
