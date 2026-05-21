/**
 * Community Contact API
 *
 * GET    /api/v1/community/contact?communityId=N  — read contact info for the community
 * PATCH  /api/v1/community/contact                 — update contact info (admin only)
 *
 * Plan A1 drain (post-pilot drain #4). Input validation, output validation,
 * and canonical envelope wrapping are delegated to `runRoute()` from
 * `@propertypro/api-contract`. Both methods declare contracts in
 * `./contract.ts`; the runner here is purely behavior:
 *
 *     GET   → `{ data: { contactName, contactEmail, contactPhone } }`
 *     PATCH → `{ data: { contactName, contactEmail, contactPhone } }` (post-update)
 *
 * Authorization invariants:
 *   - `requireAuthenticatedUserId` for both methods
 *   - `resolveEffectiveCommunityId(req, ...)` reconciles header + query/body
 *   - `requireCommunityMembership` for both
 *   - `membership.isAdmin` gate on PATCH (community admins only)
 *   - `assertNotDemoGrace` on PATCH (no writes during demo-expiry grace window)
 *   - `logAuditEvent({ action: 'community.contact_updated' })` on PATCH —
 *     audit log is a route concern, not the service's (preserves the
 *     same authoring + payload shape as pre-migration)
 *
 * Behavior changes vs. pre-migration:
 *   - GET: invalid `communityId` body shape now `VALIDATION_ERROR` (was a
 *     generic `ValidationError` constructed by the handler with the
 *     message `'Invalid or missing communityId'`). Same 400.
 *   - PATCH: invalid body shape now `VALIDATION_ERROR` with per-field
 *     details (was: `ValidationError` with `'Invalid contact update payload'`).
 *     Same 400.
 *   - Both: header/query (or header/body) `communityId` mismatch returns
 *     404 via `resolveEffectiveCommunityId` (the pre-migration handler
 *     already used `resolveEffectiveCommunityId` for the same reason —
 *     no change here).
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getCommunityContact,
  updateCommunityContact,
} from '@/lib/services/community-contact-service';
import {
  getCommunityContactContract,
  patchCommunityContactContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(getCommunityContactContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    return getCommunityContact(communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchCommunityContactContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can update contact information');
    }

    const { updateData, contact } = await updateCommunityContact(communityId, {
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
    });

    await logAuditEvent({
      userId,
      action: 'community.contact_updated',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      newValues: updateData,
    });

    return contact;
  }),
);
