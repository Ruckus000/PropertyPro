import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError } from '@/lib/api/errors';
import { refuseUnderSupportSession } from '@/lib/support/support-scope';

/**
 * AUTHZ: PM portfolio cross-community gate. Authenticates the caller and
 * requires them to be a property-manager admin in at least one community —
 * the two-step gate every `/api/v1/pm/*` (and `billing-groups/mine`) route
 * needs before doing cross-community work. Returns the authenticated userId
 * on success; throws `ForbiddenError` (403) otherwise.
 *
 * REFUSED under a support session. Every route behind this gate is keyed on
 * the user id alone and spans the user's whole portfolio — reads across every
 * managed community, and writes to N of them (bulk announcements/documents,
 * template apply, community + Stripe checkout creation). A support session is
 * consented for ONE community, so none of that is within its grant. Narrowing
 * would not do: these are portfolio tools, and the per-community equivalents
 * (site editor, branding) resolve tenancy themselves and stay available.
 *
 * `req` is taken explicitly (not read from `next/headers`) so the refusal is
 * visible at every call site and unit-testable through the route's own request.
 *
 * `message` customizes the 403 text so each route keeps its existing,
 * possibly consumer-asserted wording. It applies to the not-a-PM refusal
 * only: the support-session refusal always carries the fixed
 * `SUPPORT_SESSION_DENIED_MESSAGE`, overriding `message`.
 *
 * `isPmAdminInAnyCommunity` is imported from the `pm-communities` re-export (not `@propertypro/db/unsafe` directly)
 * so this helper carries no service-role import and needs no unsafe allowlist
 * entry. Statutory/plan gates specific to a route (e.g. portfolio-templates
 * plan access) stay at the call site — apply them AFTER this helper.
 */
export async function requirePmPortfolioAccess(
  req: { headers: Headers },
  message = 'This endpoint is only available to property managers',
): Promise<string> {
  const userId = await requireAuthenticatedUserId();
  refuseUnderSupportSession(req.headers);
  if (!(await isPmAdminInAnyCommunity(userId))) {
    throw new ForbiddenError(message);
  }
  return userId;
}
