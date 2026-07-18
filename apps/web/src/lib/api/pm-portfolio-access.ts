import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError } from '@/lib/api/errors';

/**
 * AUTHZ: PM portfolio cross-community gate. Authenticates the caller and
 * requires them to be a property-manager admin in at least one community —
 * the two-step gate every `/api/v1/pm/*` (and `billing-groups/mine`) route
 * needs before doing cross-community work. Returns the authenticated userId
 * on success; throws `ForbiddenError` (403) otherwise.
 *
 * `message` customizes the 403 text so each route keeps its existing,
 * possibly consumer-asserted wording. `isPmAdminInAnyCommunity` is imported
 * from the `pm-communities` re-export (not `@propertypro/db/unsafe` directly)
 * so this helper carries no service-role import and needs no unsafe allowlist
 * entry. Statutory/plan gates specific to a route (e.g. portfolio-templates
 * plan access) stay at the call site — apply them AFTER this helper.
 */
export async function requirePmPortfolioAccess(
  message = 'This endpoint is only available to property managers',
): Promise<string> {
  const userId = await requireAuthenticatedUserId();
  if (!(await isPmAdminInAnyCommunity(userId))) {
    throw new ForbiddenError(message);
  }
  return userId;
}
