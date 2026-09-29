/**
 * GET /api/v1/me/communities
 *
 * Returns the list of communities the authenticated user belongs to.
 * Used by the community switcher and overview page for multi-community
 * users.
 *
 * Plan A1 drain (post-pilot): input validation is a no-op (no params /
 * query / body) and output validation + canonical envelope wrapping are
 * delegated to `runRoute()` from `@propertypro/api-contract`. The wire
 * response is the canonical single-payload envelope:
 *
 *     { data: [{ id, name, slug, role, displayTitle, communityType }, ...] }
 *
 * Authorization: user is the anchor — only returns rows from the user's
 * own `user_roles`. No tenant scope; no RBAC matrix lookup. The
 * `listCommunitiesForUser` query is documented as an authorized
 * cross-tenant escape-hatch (`@propertypro/db/unsafe`) — see
 * `apps/web/src/lib/api/user-communities.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { getSupportScope, narrowToSupportScope } from '@/lib/support/support-scope';
import { meCommunitiesContract } from './contract';

// route-gate: self-scoped — lists the caller's own memberships (narrowed to the consented community under a support session)
export const GET = withErrorHandler(
  runRoute(meCommunitiesContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    // Under a support session the "caller" is the impersonated user, whose
    // memberships span communities the session was never consented for.
    const rows = narrowToSupportScope(
      await listCommunitiesForUser(userId),
      getSupportScope(req.headers),
      (r) => r.communityId,
    );
    return rows.map((r) => ({
      id: r.communityId,
      name: r.communityName,
      slug: r.slug,
      role: r.role,
      displayTitle: r.displayTitle,
      communityType: r.communityType,
    }));
  }),
);
