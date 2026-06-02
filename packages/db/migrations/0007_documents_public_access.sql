-- Migration 0007: documents.public_access flag.
--
-- Adds a boolean controlling whether an individual document is exposed on
-- the unauthenticated public community site (rendered via DocumentsBlock
-- and listed in sitemap.xml).
--
-- Default is FALSE — secure by default. Existing rows backfill to false,
-- so the public DocumentsBlock will go empty on deploy until PMs opt
-- documents in. This trade-off is intentional: the spec (Section 2.10)
-- requires that documents marked `public_access = false` are NEVER
-- included on the public site, and a backfill-to-true would invert that.
--
-- Filtered on by:
--   - apps/web/src/lib/db/public-community-reader.ts (listDocuments)
--   - apps/web/src/lib/db/public-community-reader.ts (listPublicDocumentsForSitemap)

BEGIN;

ALTER TABLE documents
  ADD COLUMN public_access boolean NOT NULL DEFAULT false;

COMMIT;
