/**
 * POST /api/v1/admin/deletion-requests/[id]/intervene
 *
 * Platform admin cancels a community deletion request.
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { interveneCommunityDeletion } from '@/lib/services/account-lifecycle-service';

export { handleOptions as OPTIONS };

const interveneBodySchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const POST = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const adminUserId = await requirePlatformAdmin();
    const origin = req.headers.get('origin');
    const { id } = await context.params;
    const requestId = Number(id);

    if (Number.isNaN(requestId) || requestId <= 0) {
      throw new ValidationError('Invalid deletion request ID');
    }

    const body = await req.json();
    const parsed = interveneBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const result = await interveneCommunityDeletion(requestId, {
      adminUserId,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ data: result }, { headers: corsHeaders(origin) });
  },
);
