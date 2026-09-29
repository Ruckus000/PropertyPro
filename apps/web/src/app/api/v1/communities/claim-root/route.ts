/**
 * POST /api/v1/communities/claim-root (role-v3 Phase 2b).
 *
 * The one sanctioned path for a property_manager to become root (spec §3.5).
 * `{ communityId }` claims root for one community; `{ claimAll: true }` claims
 * every rootless community where the caller is a property_manager. Authorization
 * is the explicit property_manager + rootless check inside the claim service —
 * there is no `requirePermission`/RBAC gate (see contract.ts for why).
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import {
  claimAllRoots,
  claimRoot,
  type ClaimResult,
} from '@/lib/services/claim-root-service';
import { ForbiddenError } from '@/lib/api/errors';
import { getSupportScope, SUPPORT_SESSION_DENIED_MESSAGE } from '@/lib/support/support-scope';
import { claimRootContract } from './contract';

// route-gate: self-scoped — claim service admits only a property_manager of a rootless community, acting for themselves (ADR-006 spec 3.5)
export const POST = withErrorHandler(
  runRoute(claimRootContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();

    // This route declares no tenantScope, so nothing reconciles the body's
    // communityId with the support session's pinned community. Under a support
    // session: claimAll (a write to every rootless community the user manages)
    // is refused, and a single claim must target the consented community.
    const supportScope = getSupportScope(req.headers);
    if (
      supportScope &&
      (body.claimAll === true || supportScope.communityId !== body.communityId)
    ) {
      throw new ForbiddenError(SUPPORT_SESSION_DENIED_MESSAGE);
    }

    let results: ClaimResult[];
    if (body.claimAll === true) {
      results = await claimAllRoots(userId);
    } else {
      // `.refine` guarantees communityId is present when claimAll is not true.
      results = [await claimRoot(userId, body.communityId as number)];
    }

    // Return the plain payload; the runner wraps it in the canonical
    // `{ data: { results } }` envelope (response schema is `z.unknown()`).
    return { results };
  }),
);
