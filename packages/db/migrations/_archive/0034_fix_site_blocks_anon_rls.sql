-- Fix: restrict anonymous read access to community-scoped blocks only.
-- The original policy (0033) allowed anon to read ALL published blocks
-- across all communities, enabling cross-tenant data enumeration.

DROP POLICY IF EXISTS site_blocks_anon_read ON site_blocks;

CREATE POLICY site_blocks_anon_read ON site_blocks
  FOR SELECT TO anon
  USING (
    is_draft = false
    AND community_id = current_setting('app.community_id')::bigint
  );
