/**
 * Lightweight endpoint for the community switcher.
 * Returns the count of communities the authenticated user belongs to.
 *
 * Used by ProfileMenu to conditionally show "Switch Community" when count > 1.
 * Lazy-loaded on dropdown open to avoid adding a DB query to every page load.
 *
 * Plan A1 drain #24: input plumbing (none) and output envelope wrapping
 * delegated to `runRoute()` from `@propertypro/api-contract`. Auth chain
 * preserved verbatim — `requireAuthenticatedUserId → countCommunitiesForUser`.
 * The wire shape is `{ data: { count } }`, byte-identical to pre-migration.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { countCommunitiesForUser, listCommunitiesForUser } from '@/lib/api/user-communities';
import { getSupportScope, narrowToSupportScope } from '@/lib/support/support-scope';
import { userCommunitiesGetContract } from './contract';

// route-gate: self-scoped — count/list of the caller's own memberships (narrowed to the consented community under a support session)
export const GET = withErrorHandler(
  runRoute(userCommunitiesGetContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const supportScope = getSupportScope(req.headers);
    if (supportScope) {
      // Count exactly what /api/v1/me/communities would list, so the profile
      // menu's "Switch Community" does not advertise communities outside the
      // session's grant. `countCommunitiesForUser` cannot be filtered, so list
      // and count DISTINCT communities, as it does.
      const rows = narrowToSupportScope(
        await listCommunitiesForUser(userId),
        supportScope,
        (r) => r.communityId,
      );
      return { count: new Set(rows.map((r) => r.communityId)).size };
    }
    const count = await countCommunitiesForUser(userId);
    return { count };
  }),
);
