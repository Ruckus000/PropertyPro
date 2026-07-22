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

    const { clientSecret } = await createAddCommunityCheckout({
      billingGroupId,
      stripeCustomerId,
      pendingSignupId,
      communityType: body.communityType,
      planId: body.planId,
      candidateSlug: slugCheck.normalizedSubdomain,
      returnBaseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
    });

    return { clientSecret, pendingSignupId, billingGroupId };
  }),
);
