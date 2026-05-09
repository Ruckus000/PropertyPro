/**
 * POST /api/v1/admin/deletion-requests/[id]/recover
 *
 * Recover a soft-deleted user or community. Reads request_type from
 * the deletion request to dispatch to the correct recovery function.
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import {
  getDeletionRequestType,
  recoverCommunity,
  recoverUser,
} from '@/lib/services/account-lifecycle-service';

export { handleOptions as OPTIONS };

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

    // Look up the deletion request to determine type
    const requestType = await getDeletionRequestType(requestId);
    if (!requestType) {
      throw new NotFoundError('Deletion request not found');
    }

    const result =
      requestType === 'user'
        ? await recoverUser(requestId, adminUserId)
        : await recoverCommunity(requestId, adminUserId);

    return NextResponse.json({ data: result }, { headers: corsHeaders(origin) });
  },
);
