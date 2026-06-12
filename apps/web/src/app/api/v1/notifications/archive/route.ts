/**
 * PATCH /api/v1/notifications/archive
 *
 * Archive notifications for the calling user within a community.
 * Body: `{ communityId, ids: number[] }` (non-empty).
 *
 * Plan A1 drain #17. Input validation, output validation, and canonical
 * envelope wrapping are delegated to `runRoute()` from
 * `@propertypro/api-contract`; the contract lives in `./contract.ts`.
 *
 * Wire-level response shape is unchanged — the runner produces
 * `{ data: { ok: true } }`, exactly as the pre-migration handler did via
 * `NextResponse.json(...)`.
 *
 * Authorization invariants (preserved verbatim from pre-migration):
 *   - `resolveEffectiveCommunityId(req, body.communityId)` reconciles the
 *     `x-community-id` header with the body's `communityId`
 *   - `requireAuthenticatedUserId` resolves the session user
 *   - `requireCommunityMembership` enforces tenant membership
 *   - `archiveNotifications(communityId, userId, ids)` mutates only the
 *     calling user's notifications scoped to the resolved community
 *
 * Behavior changes vs. pre-migration:
 *   - 400 body shape becomes the runner's canonical `VALIDATION_ERROR`
 *     envelope with per-field details (was a hand-constructed
 *     `ValidationError` with the message
 *     `'Body must be { communityId, ids: number[] }'`). Status unchanged.
 *   - Header/body `communityId` mismatch returns 404 via
 *     `resolveEffectiveCommunityId` (NotFoundError); this matches the
 *     pre-migration handler exactly — no change.
 *
 * Consumer impact:
 *   - No client hook currently calls this route; reserved for a future
 *     archive UX. Response shape is `{ data: { ok: true } }`.
 */
import { runRoute } from '@propertypro/api-contract';
import { archiveNotifications } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { notificationsArchiveContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(notificationsArchiveContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    await archiveNotifications(communityId, userId, body.ids);
    return { ok: true as const };
  }),
);
