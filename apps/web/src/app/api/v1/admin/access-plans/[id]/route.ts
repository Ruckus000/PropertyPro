/**
 * DELETE /api/v1/admin/access-plans/[id] — Revoke an access plan
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { revokeFreeAccess } from '@/lib/services/account-lifecycle-service';

export { handleOptions as OPTIONS };

const revokeBodySchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const DELETE = withErrorHandler(
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

    // Body is optional for DELETE
    let reason: string | undefined;
    try {
      const body = await req.json();
      const parsed = revokeBodySchema.safeParse(body);
      if (parsed.success) {
        reason = parsed.data.reason;
      }
    } catch {
      // No body provided — that's fine for DELETE
    }

    const revoked = await revokeFreeAccess(planId, {
      revokedBy: adminUserId,
      reason,
    });

    return NextResponse.json({ data: revoked }, { headers: corsHeaders(origin) });
  },
);
