/**
 * PATCH /api/v1/notifications/read
 *
 * Mark notifications as read for the calling user within a community.
 * Body: `{ communityId, ids: number[] }` to mark specific notifications, or
 *       `{ communityId, all: true }` to mark every unread notification.
 *
 * Plan A1 drain #7. Input validation, output validation, and canonical
 * envelope wrapping are delegated to `runRoute()` from
 * `@propertypro/api-contract`; the contract lives in `./contract.ts`.
 *
 * Wire-level response shape is unchanged — the runner produces
 * `{ data: { ok: true } }`, exactly as the pre-migration handler did
 * via `NextResponse.json(...)`.
 *
 * Authorization invariants (preserved verbatim from pre-migration):
 *   - `resolveEffectiveCommunityId(req, body.communityId)` reconciles the
 *     `x-community-id` header with the body's `communityId`
 *   - `requireAuthenticatedUserId` resolves the session user
 *   - `requireCommunityMembership` enforces tenant membership
 *
 * Behavior changes vs. pre-migration:
 *   - 400 body shape becomes the runner's canonical `VALIDATION_ERROR`
 *     envelope with per-field details (was a hand-constructed
 *     `ValidationError` with the message `'Body must be { communityId, ids }
 *     or { communityId, all: true }'`). Status unchanged.
 *   - Header/body `communityId` mismatch returns 404 via
 *     `resolveEffectiveCommunityId` (NotFoundError); this matches the
 *     pre-migration handler exactly — no change.
 *
 * Consumer impact:
 *   - `apps/web/src/hooks/use-notifications.ts` `useMarkRead` only checks
 *     `res.ok` on the response; it does not parse the body. The response
 *     shape change is therefore consumer-safe and the hook is unchanged.
 */
import { runRoute } from '@propertypro/api-contract';
import { markNotificationsRead } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { notificationsReadContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(notificationsReadContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    const ids = 'ids' in body ? body.ids : undefined;
    await markNotificationsRead(communityId, userId, ids);

    return { ok: true } as const;
  }),
);
