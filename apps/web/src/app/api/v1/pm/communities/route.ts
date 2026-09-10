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
import { listManagedCommunitiesForPm } from '@/lib/api/pm-communities';
import { checkSignupSubdomainAvailability } from '@/lib/auth/signup';
import { createAddCommunityCheckout } from '@/lib/services/stripe-service';
import {
  getOrCreateBillingGroupForPm,
  createPendingAddToGroupSignup,
  recordAddToGroupCheckoutSession,
} from '@/lib/billing/billing-group-service';
import {
  pmCommunitiesGetContract,
  pmCommunitiesPostContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(pmCommunitiesGetContract, async ({ query }) => {
    const userId = await requirePmPortfolioAccess();

    return listManagedCommunitiesForPm(userId, query);
  }),
);

export const POST = withErrorHandler(
  runRoute(pmCommunitiesPostContract, async ({ body }) => {
    const userId = await requirePmPortfolioAccess();

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

    const { clientSecret, sessionId } = await createAddCommunityCheckout({
      billingGroupId,
      stripeCustomerId,
      pendingSignupId,
      communityType: body.communityType,
      planId: body.planId,
      candidateSlug: slugCheck.normalizedSubdomain,
      returnBaseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
    });

    // `sessionId` was returned here all along and thrown away. It is what
    // `reconcileLostCheckoutSignups` looks up to rescue a signup whose Stripe
    // webhook never arrived — without it, a PM who PAID could not be reconciled.
    await recordAddToGroupCheckoutSession({ pendingSignupId, sessionId });

    return { clientSecret, pendingSignupId, billingGroupId };
  }),
);
