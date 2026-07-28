-- Repair `communities.site_published_at` for every community whose site was
-- published through the current editor.
--
-- ===========================================================================
-- WHAT BROKE
-- ===========================================================================
--
-- The column had no application writer. The only one was the admin
-- site-builder publish route, deleted in eab4f36e when the drag-and-drop
-- builder was replaced. Every publish since has gone through
-- `publishCommunitySite` (apps/web/src/lib/services/site-blocks-service.ts),
-- which stamps `site_blocks.published_at` per row and left the community
-- column NULL forever.
--
-- Three consumers read it, and all three have been wrong:
--
--   * the urgent notice's "publish your website first" gate
--     (urgent-notice-service.ts) — it refuses with 409 when the column is
--     NULL, so website-editor v3's Phase 7 banner has been unreachable for
--     every community that published through the current editor;
--   * `hasPublishedSite` in the v3 editor page, which drives the same copy;
--   * the admin app's "Published" label on the client workspace.
--
-- The writer is restored in the same PR as this migration. That stops the
-- drift; this repairs the rows it already produced.
--
-- ===========================================================================
-- WHY THIS IS SAFE IN EITHER DEPLOY ORDER
-- ===========================================================================
--
-- DML only — no DDL. It adds no table, column, constraint, index, policy or
-- trigger, so it is neither an expand nor a contract migration and the
-- expand-before-code / contract-after-code discipline does not apply. It can
-- be applied before or after the code ships. RLS_EXPECTED_TENANT_TABLE_COUNT
-- is unaffected (78).
--
-- Idempotent: the `site_published_at IS NULL` predicate means a second run
-- matches nothing. It NEVER overwrites a value that is already set, so a
-- community carrying a genuine older stamp from the pre-eab4f36e admin flow
-- keeps it.
--
-- Conservative on the value: MAX(published_at) over that community's live,
-- published, non-deleted blocks is exactly what `publishCommunitySite` now
-- writes going forward, so repaired rows and future rows mean the same thing.
-- Communities that have never published anything are left NULL — that is the
-- correct value for them, and the urgent-notice gate should keep refusing.

UPDATE communities c
   SET site_published_at = sub.max_published_at
  FROM (
    SELECT community_id, MAX(published_at) AS max_published_at
      FROM site_blocks
     WHERE is_draft = false
       AND deleted_at IS NULL
       AND published_at IS NOT NULL
     GROUP BY community_id
  ) AS sub
 WHERE c.id = sub.community_id
   AND c.site_published_at IS NULL;
