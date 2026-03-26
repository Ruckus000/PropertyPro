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
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createBillingPortalSession } from '@/lib/services/stripe-service';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { ReauthRequiredError } from '@/lib/api/errors';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requireCommunityMembership } from '@/lib/api/community-membership';
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

  // 3. Verify membership (403 if not a member)
  await requireCommunityMembership(context.communityId, userId);

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
