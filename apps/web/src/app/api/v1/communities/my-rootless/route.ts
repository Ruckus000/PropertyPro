/**
 * GET /api/v1/communities/my-rootless (role-v3 Phase 2b).
 *
 * Returns the communities where the authenticated caller holds
 * `property_manager` and no `root_manager` exists yet. This is the single read
 * source for both the claim-root banner (count > 0) and the aggregated claim
 * screen. Authorization is `requireAuthenticatedUserId` — there is no RBAC gate
 * ('roles' is not in RBAC_RESOURCES until Phase 3; see contract.ts).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
// findMyRootlessCommunities resolves ONLY the caller's own property_manager
// memberships (cross-community by nature). This route file MUST also be in
// WEB_UNSAFE_IMPORT_ALLOWLIST in scripts/verify-scoped-db-access.ts (both guards
// apply — the #718 two-guard lesson).
// AUTHZ: self-scoped to the authenticated session user id (requireAuthenticatedUserId) passed below, never an attacker-supplied value.
import { findMyRootlessCommunities } from '@propertypro/db/unsafe';
import { myRootlessContract } from './contract';

export const GET = withErrorHandler(
  runRoute(myRootlessContract, async () => {
    const userId = await requireAuthenticatedUserId();
    const communities = await findMyRootlessCommunities(userId);

    // Return the plain payload; the runner wraps it in the canonical
    // `{ data: { communities } }` envelope (response schema is `z.unknown()`).
    return { communities };
  }),
);
