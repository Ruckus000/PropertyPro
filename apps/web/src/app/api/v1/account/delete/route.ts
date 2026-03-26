/**
 * GET    /api/v1/account/delete — Check active deletion request status
 * POST   /api/v1/account/delete — Request account deletion
 * DELETE /api/v1/account/delete — Cancel account deletion
 *
 * User requests, checks, or cancels their own account deletion.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { desc } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import {
  requestUserDeletion,
  cancelUserDeletion,
} from '@/lib/services/account-lifecycle-service';
import { eq, and } from '@propertypro/db/filters';
import { accountDeletionRequests } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { AppError } from '@/lib/api/errors/AppError';

// GET — check active deletion request
export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  const db = createUnscopedClient();

  const [activeRequest] = await db
    .select({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
      coolingEndsAt: accountDeletionRequests.coolingEndsAt,
      createdAt: accountDeletionRequests.createdAt,
    })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.requestType, 'user'),
      ),
    )
    .orderBy(desc(accountDeletionRequests.createdAt))
    .limit(1);

  if (!activeRequest || activeRequest.status === 'cancelled' || activeRequest.status === 'recovered') {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({ data: activeRequest });
});

// POST — request deletion
export const POST = withErrorHandler(async (): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  await requireFreshReauth(userId);
  const request = await requestUserDeletion(userId);
  return NextResponse.json({ data: request }, { status: 201 });
});

// DELETE — cancel deletion
export const DELETE = withErrorHandler(async (): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();

  // Find the user's active cooling request
  const db = createUnscopedClient();
  const [activeRequest] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.requestType, 'user'),
        eq(accountDeletionRequests.status, 'cooling'),
      ),
    )
    .limit(1);

  if (!activeRequest) {
    throw new AppError('No active deletion request found', 404, 'NOT_FOUND');
  }

  await cancelUserDeletion(activeRequest.id, userId);
  return NextResponse.json({ data: { cancelled: true } });
});
