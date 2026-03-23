/**
 * GET /api/v1/admin/access-plans/community/[id] — List plans for a specific community
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from '@propertypro/db/filters';
import { accessPlans } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { computeAccessPlanStatus } from '@/lib/services/account-lifecycle-service';

export { handleOptions as OPTIONS };

export const GET = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const adminUserId = await requirePlatformAdmin();
    void adminUserId;
    const origin = req.headers.get('origin');
    const { id } = await context.params;
    const communityId = Number(id);

    if (Number.isNaN(communityId) || communityId <= 0) {
      throw new ValidationError('Invalid community ID');
    }

    const db = createUnscopedClient();
    const rows = await db
      .select()
      .from(accessPlans)
      .where(eq(accessPlans.communityId, communityId));

    const data = rows.map((plan) => ({
      ...plan,
      status: computeAccessPlanStatus(plan),
    }));

    return NextResponse.json({ data }, { headers: corsHeaders(origin) });
  },
);
