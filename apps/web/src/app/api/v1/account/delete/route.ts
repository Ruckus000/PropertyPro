/**
 * POST /api/v1/account/delete
 * DELETE /api/v1/account/delete (cancel)
 *
 * User requests or cancels their own account deletion.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import {
  requestUserDeletion,
  cancelUserDeletion,
} from '@/lib/services/account-lifecycle-service';
import { eq, and } from '@propertypro/db/filters';
import { accountDeletionRequests } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { AppError } from '@/lib/api/errors/AppError';

// POST — request deletion
export const POST = withErrorHandler(async (): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
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
