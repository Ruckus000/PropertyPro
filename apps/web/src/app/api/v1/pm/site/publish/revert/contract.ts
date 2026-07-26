/**
 * Route contract for `POST /api/v1/pm/site/publish/revert`.
 *
 * Website editor v3, Phase 6 — one-step revert to a past publish.
 *
 * PLAN POSTURE (gap-analysis decision 5): revert is available on EVERY plan,
 * deliberately. A PM who has just broken their association's public site must
 * be able to undo it regardless of tier; the full history LOG is the premium
 * surface, the escape hatch is not. So this route carries the PM role check and
 * the `hasSiteEditor` gate and nothing further — no `requireEntitledForAdminRead`,
 * no history-tier feature gate.
 *
 * Restores into the DRAFT layer; the PM publishes to make it live. See
 * `revertToSnapshot` in site-blocks-service for why.
 *
 * `permission: { resource: 'settings', action: 'write' }` — `settings` IS in
 * `RBAC_RESOURCES`; the real gate is the PM_MANAGER_ROLES role check in the
 * handler (documented placeholder pattern for PM-only routes, mirrors
 * `pm/site/domain`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const publishRevertContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/publish/revert',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      /**
       * The publish-history entry to restore. The service pins the lookup to
       * `communityId` as well, so an id from another association resolves to
       * nothing rather than to someone else's site content.
       */
      snapshotId: z.number().int().positive(),
    }),
  },
  response: z.object({
    ok: z.literal(true),
    snapshotId: z.number(),
    /** ISO-8601 `published_at` of the restored version (not a new stamp). */
    restoredPublishedAt: z.string(),
    /** Draft rows written from the snapshot. */
    restoredCount: z.number(),
    /** Tombstone drafts staged for sections the restored version predates. */
    stagedRemovalCount: z.number(),
    /** Pending drafts cleared to make room for the restore. */
    clearedDraftCount: z.number(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
