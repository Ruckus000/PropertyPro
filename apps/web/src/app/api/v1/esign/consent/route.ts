/**
 * E-Sign Consent API
 *
 * GET    /api/v1/esign/consent?communityId=N — fetch active consent status
 * DELETE /api/v1/esign/consent?communityId=N — revoke active consent
 *
 * Plan A1 drain #22. First `DELETE` handler in the contract corpus. Two
 * contracts in one file (mirroring drain #13's GET + PATCH plumbing);
 * see `./contract.ts` for the schemas and the rationale around
 * `permission.action: 'write'` for DELETE.
 *
 * Authorization invariants (preserved verbatim):
 *   GET    — `requireAuthenticatedUserId`
 *          → `resolveEffectiveCommunityId(req, query.communityId)`
 *          → `requireCommunityMembership`
 *          → `requireEsignReadPermission`
 *          → `getConsentStatus(communityId, actorUserId)`
 *   DELETE — `requireAuthenticatedUserId`
 *          → `resolveEffectiveCommunityId(req, query.communityId)`
 *          → `requireCommunityMembership`
 *          → `requireEsignWritePermission`
 *          → `revokeConsent(communityId, actorUserId, requestId)`
 *            (with `requestId = req.headers.get('x-request-id')`, forwarded
 *            verbatim — including the `null` value when the header is absent)
 *
 * Behavior changes vs. pre-migration:
 *   - Pre-migration used `parseCommunityIdFromQuery(req)`, which already
 *     delegates to `resolveEffectiveCommunityId` (drain #10 lesson). The
 *     header/query mismatch → 404 behavior is therefore PRESERVED, not
 *     introduced. The only real wire delta is the 400 body shape (now the
 *     canonical `VALIDATION_ERROR` envelope; status unchanged at 400).
 *   - DELETE response shape is byte-identical: `{ data: { success: true } }`.
 *
 * Consumer impact: no UI consumers found via grep of `/api/v1/esign/consent`
 * in `apps/web/src/`. Safe to ship.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requireEsignReadPermission,
  requireEsignWritePermission,
} from '@/lib/esign/esign-route-helpers';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getConsentStatus, revokeConsent } from '@/lib/services/esign-service';
import {
  esignConsentGetContract,
  esignConsentDeleteContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(esignConsentGetContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    return getConsentStatus(communityId, actorUserId);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(esignConsentDeleteContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    await revokeConsent(communityId, actorUserId, requestId);

    return { success: true as const };
  }),
);
