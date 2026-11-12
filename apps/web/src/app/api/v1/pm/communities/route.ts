/**
 * GET/POST /api/v1/pm/communities
 *
 * Plan A1 drain #165. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requirePmPortfolioAccess } from '@/lib/api/pm-portfolio-access';
import { listManagedCommunitiesForPm, requireAddCommunityAccess } from '@/lib/api/pm-communities';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { checkSignupSubdomainAvailability } from '@/lib/auth/signup';
import {
  isFloridaZip,
  isPlanAvailableForCommunityType,
  normalizeSignupSubdomain,
} from '@/lib/auth/signup-schema';
import { createAddCommunityCheckout } from '@/lib/services/stripe-service';
import {
  getOrCreateBillingGroupForPm,
  createPendingAddToGroupSignup,
  recordAddToGroupCheckoutSession,
  retireOwnAddToGroupSignup,
} from '@/lib/billing/billing-group-service';
import {
  pmCommunitiesGetContract,
  pmCommunitiesPostContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(pmCommunitiesGetContract, async ({ query, req }) => {
    const userId = await requirePmPortfolioAccess(req);

    return listManagedCommunitiesForPm(userId, query);
  }),
);

export const POST = withErrorHandler(
  runRoute(pmCommunitiesPostContract, async ({ body, req }) => {
    const userId = await requirePmPortfolioAccess(req);
    // Adding a community bills the portfolio: only its billing owner, while
    // root in it, may (see decideAddCommunityAccess). Reauth applies on top,
    // as for change-plan: who you are and that you just proved it are separate.
    await requireAddCommunityAccess(userId);
    await requireFreshReauth(userId);

    if (!isPlanAvailableForCommunityType(body.communityType, body.planId)) {
      throw new ValidationError('This plan is not available for this community type', {
        field: 'planId',
      });
    }
    const zip5 = /^(\d{5})(?:-\d{4})?$/.exec(body.zipCode)?.[1];
    if (body.state.toUpperCase() !== 'FL' || !zip5 || !isFloridaZip(zip5)) {
      throw new ValidationError('PropertyPro Florida serves Florida associations only. Enter a Florida address.', {
        field: 'zipCode',
      });
    }

    // A retry must not be blocked by this PM's own abandoned checkout for it.
    await retireOwnAddToGroupSignup(userId, normalizeSignupSubdomain(body.subdomain));
    const slugCheck = await checkSignupSubdomainAvailability(body.subdomain);
    if (!slugCheck.available) {
      throw new ValidationError('Subdomain is not available', {
        field: 'subdomain',
        reason: slugCheck.reason,
        message: slugCheck.message,
      });
    }

    const { billingGroupId, stripeCustomerId } = await getOrCreateBillingGroupForPm(userId);

    const pendingSignupId = await createPendingAddToGroupSignup({
      userId,
      billingGroupId,
      input: { ...body, subdomain: slugCheck.normalizedSubdomain },
    });

    // Stripe sends the PM back to the host they are signed in on, derived the
    // way the signup checkout derives it (lib/actions/checkout.ts). This read
    // an undocumented NEXT_PUBLIC_BASE_URL that fell back to localhost, so an
    // unset var returned a PM who had just PAID to localhost:3000.
    const host = req.headers.get('host') ?? req.nextUrl.host;
    const returnBaseUrl = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;

    const { clientSecret, sessionId } = await createAddCommunityCheckout({
      billingGroupId,
      stripeCustomerId,
      pendingSignupId,
      communityType: body.communityType,
      planId: body.planId,
      candidateSlug: slugCheck.normalizedSubdomain,
      returnBaseUrl,
    });

    // `sessionId` was returned here all along and thrown away. It is what
    // `reconcileLostCheckoutSignups` looks up to rescue a signup whose Stripe
    // webhook never arrived — without it, a PM who PAID could not be reconciled.
    await recordAddToGroupCheckoutSession({ pendingSignupId, sessionId });

    return { clientSecret, pendingSignupId, billingGroupId };
  }),
);
