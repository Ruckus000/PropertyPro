/**
 * POST /api/v1/admin/deletion-requests/[id]/recover
 *
 * Recover a soft-deleted user or community. Reads request_type from
 * the deletion request to dispatch to the correct recovery function.
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from '@propertypro/db/filters';
import { accountDeletionRequests } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import {
  recoverUser,
  recoverCommunity,
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
    const db = createUnscopedClient();
    const [request] = await db
      .select({ requestType: accountDeletionRequests.requestType })
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, requestId))
      .limit(1);

    if (!request) {
      throw new NotFoundError('Deletion request not found');
    }

    let result;
    if (request.requestType === 'user') {
      result = await recoverUser(requestId, adminUserId);
    } else {
      result = await recoverCommunity(requestId, adminUserId);
    }

    return NextResponse.json({ data: result }, { headers: corsHeaders(origin) });
  },
);
