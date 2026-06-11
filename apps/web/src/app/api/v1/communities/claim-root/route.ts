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
import { claimRootContract } from './contract';

export const POST = withErrorHandler(
  runRoute(claimRootContract, async ({ body }) => {
    const userId = await requireAuthenticatedUserId();

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
