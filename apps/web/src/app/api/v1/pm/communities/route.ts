import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { COMMUNITY_TYPES } from '@propertypro/shared';
import { isPmAdminInAnyCommunity } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { listManagedCommunitiesForPm } from '@/lib/api/pm-communities';
import { checkSignupSubdomainAvailability } from '@/lib/auth/signup';
import { createCommunityForPm } from '@/lib/pm/create-community';
import { createAddCommunityCheckout } from '@/lib/services/stripe-service';
import { getOrCreateBillingGroupForPm, createPendingAddToGroupSignup } from '@/lib/billing/billing-group-service';

const querySchema = z.object({
  communityType: z.enum(COMMUNITY_TYPES).optional(),
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('This endpoint is only available to property managers');
  }

  const { searchParams } = new URL(req.url);

  const rawQuery = {
    communityType: searchParams.get('communityType') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  };

  const parseResult = querySchema.safeParse(rawQuery);
  if (!parseResult.success) {
    throw new ValidationError('Invalid PM communities query', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const rows = await listManagedCommunitiesForPm(userId, parseResult.data);
  return NextResponse.json({ data: rows });
});

const createCommunitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  communityType: z.enum(COMMUNITY_TYPES),
  planId: z.enum(['essentials', 'professional', 'operations_plus']),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(2),
  zipCode: z.string().trim().min(5).max(10),
  subdomain: z.string().trim().min(3).max(63),
  timezone: z.string().trim().min(1).default('America/New_York'),
  unitCount: z.number().int().min(1).max(10000),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('This endpoint is only available to property managers');
  }

  const body = await req.json();
  const parseResult = createCommunitySchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid community data', { issues: parseResult.error.issues });
  }

  const input = parseResult.data;

  const slugCheck = await checkSignupSubdomainAvailability(input.subdomain);
  if (!slugCheck.available) {
    throw new ValidationError('Subdomain is not available', {
      field: 'subdomain',
      reason: slugCheck.reason,
      message: slugCheck.message,
    });
  }

  // 1. Get or create billing group for this PM
  const { billingGroupId, stripeCustomerId } = await getOrCreateBillingGroupForPm(userId);

  // 2. Create pending_signups row for add-to-group flow
  const pendingSignupId = await createPendingAddToGroupSignup({
    userId,
    billingGroupId,
    input: { ...input, subdomain: slugCheck.normalizedSubdomain },
  });

  // 3. Create Stripe Checkout session (no trial)
  const { clientSecret } = await createAddCommunityCheckout({
    billingGroupId,
    stripeCustomerId,
    pendingSignupId,
    communityType: input.communityType,
    planId: input.planId,
    candidateSlug: slugCheck.normalizedSubdomain,
    returnBaseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
  });

  return NextResponse.json(
    { data: { clientSecret, pendingSignupId, billingGroupId } },
    { status: 202 },
  );
});
