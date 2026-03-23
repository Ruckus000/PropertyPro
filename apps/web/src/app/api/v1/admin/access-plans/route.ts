/**
 * GET  /api/v1/admin/access-plans  — List all access plans (optional communityId filter)
 * POST /api/v1/admin/access-plans  — Grant free access to a community
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, isNull } from '@propertypro/db/filters';
import { accessPlans, communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import {
  computeAccessPlanStatus,
  grantFreeAccess,
} from '@/lib/services/account-lifecycle-service';

export { handleOptions as OPTIONS };

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const grantBodySchema = z.object({
  communityId: z.number().int().positive(),
  durationMonths: z.number().int().min(1).max(60),
  gracePeriodDays: z.number().int().min(0).max(365).optional().default(30),
  notes: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// GET — list access plans
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const adminUserId = await requirePlatformAdmin();
  void adminUserId; // used only for auth guard
  const origin = req.headers.get('origin');

  const db = createUnscopedClient();
  const url = new URL(req.url);
  const communityIdParam = url.searchParams.get('communityId');

  let rows;
  if (communityIdParam) {
    const communityId = Number(communityIdParam);
    if (Number.isNaN(communityId) || communityId <= 0) {
      throw new ValidationError('communityId must be a positive integer');
    }
    rows = await db
      .select()
      .from(accessPlans)
      .where(eq(accessPlans.communityId, communityId));
  } else {
    rows = await db.select().from(accessPlans);
  }

  const data = rows.map((plan) => ({
    ...plan,
    status: computeAccessPlanStatus(plan),
  }));

  return NextResponse.json({ data }, { headers: corsHeaders(origin) });
});

// ---------------------------------------------------------------------------
// POST — grant free access
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const adminUserId = await requirePlatformAdmin();
  const origin = req.headers.get('origin');

  const body = await req.json();
  const parsed = grantBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const { communityId, durationMonths, gracePeriodDays, notes } = parsed.data;

  // Verify community exists
  const db = createUnscopedClient();
  const [community] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!community) {
    throw new ValidationError('Community not found', { communityId: 'Community does not exist' });
  }

  const plan = await grantFreeAccess(communityId, {
    durationMonths,
    gracePeriodDays,
    notes,
    grantedBy: adminUserId,
  });

  return NextResponse.json(
    { data: { ...plan, status: computeAccessPlanStatus(plan) } },
    { status: 201, headers: corsHeaders(origin) },
  );
});
