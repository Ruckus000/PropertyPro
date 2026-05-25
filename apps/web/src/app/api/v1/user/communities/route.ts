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
import { countCommunitiesForUser } from '@/lib/api/user-communities';
import { userCommunitiesGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(userCommunitiesGetContract, async () => {
    const userId = await requireAuthenticatedUserId();
    const count = await countCommunitiesForUser(userId);
    return { count };
  }),
);
