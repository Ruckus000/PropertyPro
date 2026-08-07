/**
 * Billing Portal route handler — P2-34
 *
 * Generates a fresh Stripe Customer Portal session on-demand and redirects.
 * Linked from payment failure and cancellation emails instead of embedding
 * a direct Stripe portal URL (which expires in ~5 minutes).
 *
 * Auth: requires an active session. The community's stripeCustomerId is looked
 * up via communityId from the request URL — the user cannot inject an arbitrary
 * customer ID because we always look it up server-side.
 */
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// AUTHZ: Billing/Stripe path — pre-tenant subscription lookup.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createBillingPortalSession } from '@/lib/services/stripe-service';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { ReauthRequiredError } from '@/lib/api/errors';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { hasRole } from '@/lib/api/role-guard';
import { headers } from 'next/headers';

export const GET = async (req: NextRequest): Promise<never> => {
  // 1. Require authenticated user
  const userId = await requireAuthenticatedUserId();

  try {
    await requireFreshReauth(userId);
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      redirect(`/settings/billing?reauth=required`);
    }
    throw err;
  }

  // 2. Resolve community from subdomain / querystring
  const requestHeaders = await headers();
  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    ),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/dashboard');
  }

  // 3. Verify membership AND billing authority.
  //
  // Membership alone is not enough: the Stripe Customer Portal exposes
  // invoices and payment methods and lets the visitor CANCEL the subscription.
  // Without this check any member who could pass the reauth prompt — including
  // a tenant — could cancel the community's subscription.
  //
  // R3-03: this is ROOT-ONLY, not management-tier. `settings:write` cannot
  // express it — the RBAC matrix collapses property_manager and root_manager
  // onto a single `manager` row, so gating on it would keep handing every
  // property manager the ability to cancel the subscription.
  //
  // `hasRole` rather than `requireRootManager` because this handler must
  // REDIRECT, not throw: it is a plain App Router handler, not an /api/v1
  // route, so there is no `withErrorHandler` and no error boundary — a raw
  // ForbiddenError surfaces as an opaque 500 plus a Sentry event. The grace and
  // soft-lock banners render for non-admins too, and the dunning emails go to
  // all admin recipients, so a property manager or unit owner following one of
  // those links lands here legitimately and deserves the billing page. Every
  // other rejection path in this handler redirects the same way.
  //
  // `forbidden=root` tells the billing page to explain WHY it bounced —
  // without it, a PM clicking a dunning-email link just lands on an unchanged
  // page with no account of what happened.
  const membership = await requireCommunityMembership(context.communityId, userId);
  if (!hasRole(membership, ['root_manager'])) {
    redirect(`/settings/billing?communityId=${context.communityId}&forbidden=root`);
  }

  // 4. Look up the Stripe customer ID
  const db = createUnscopedClient();
  const rows = await db
    .select({ stripeCustomerId: communities.stripeCustomerId })
    .from(communities)
    .where(eq(communities.id, context.communityId))
    .limit(1);

  const customerId = rows[0]?.stripeCustomerId;
  if (!customerId) {
    redirect('/dashboard');
  }

  // 5. Generate a fresh portal session and redirect
  const returnUrl = new URL('/dashboard', req.url).toString();
  const portalSession = await createBillingPortalSession(customerId, returnUrl);

  redirect(portalSession.url);
};
