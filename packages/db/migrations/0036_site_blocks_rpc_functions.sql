-- Transactional RPC functions for site block operations.

-- reorder_site_blocks: atomically reorder blocks within a single transaction.
-- p_order is a JSONB array of {"id": N, "blockOrder": N} objects.
CREATE OR REPLACE FUNCTION reorder_site_blocks(
  p_community_id bigint,
  p_order jsonb
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item jsonb;
  updated_count int := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_order)
  LOOP
    UPDATE site_blocks
    SET block_order = (item->>'blockOrder')::int,
        updated_at = now()
    WHERE id = (item->>'id')::bigint
      AND community_id = p_community_id
      AND deleted_at IS NULL;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

-- publish_community_drafts: atomically lock and publish all draft blocks.
-- Returns the published rows as JSONB.
CREATE OR REPLACE FUNCTION publish_community_drafts(
  p_community_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Lock draft rows to prevent concurrent modifications
  PERFORM id FROM site_blocks
  WHERE community_id = p_community_id
    AND is_draft = true
    AND deleted_at IS NULL
  FOR UPDATE;

  -- Publish all locked drafts
  WITH published AS (
    UPDATE site_blocks
    SET is_draft = false,
        published_at = now(),
        updated_at = now()
    WHERE community_id = p_community_id
      AND is_draft = true
      AND deleted_at IS NULL
    RETURNING *
  )
  SELECT jsonb_agg(row_to_json(published)) INTO result FROM published;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
