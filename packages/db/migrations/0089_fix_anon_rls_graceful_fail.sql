-- Make anon RLS fail closed gracefully instead of throwing on missing setting.
-- current_setting('app.community_id', true) returns NULL instead of throwing
-- when the setting doesn't exist. coalesce maps NULL/empty to '0', which
-- won't match any real community_id — fail-closed, no 500.

DROP POLICY IF EXISTS site_blocks_anon_read ON site_blocks;

CREATE POLICY site_blocks_anon_read ON site_blocks
  FOR SELECT TO anon
  USING (
    is_draft = false
    AND community_id = coalesce(
      nullif(current_setting('app.community_id', true), ''),
      '0'
    )::bigint
  );
