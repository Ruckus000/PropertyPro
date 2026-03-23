/**
 * POST /api/v1/admin/access-plans/[id]/extend — Extend an access plan
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import {
  computeAccessPlanStatus,
  extendFreeAccess,
} from '@/lib/services/account-lifecycle-service';

export { handleOptions as OPTIONS };

const extendBodySchema = z.object({
  additionalMonths: z.number().int().min(1).max(60),
  notes: z.string().max(1000).optional(),
});

export const POST = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const adminUserId = await requirePlatformAdmin();
    const origin = req.headers.get('origin');
    const { id } = await context.params;
    const planId = Number(id);

    if (Number.isNaN(planId) || planId <= 0) {
      throw new ValidationError('Invalid plan ID');
    }

    const body = await req.json();
    const parsed = extendBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const newPlan = await extendFreeAccess(planId, {
      additionalMonths: parsed.data.additionalMonths,
      grantedBy: adminUserId,
      notes: parsed.data.notes,
    });

    return NextResponse.json(
      { data: { ...newPlan, status: computeAccessPlanStatus(newPlan) } },
      { headers: corsHeaders(origin) },
    );
  },
);
