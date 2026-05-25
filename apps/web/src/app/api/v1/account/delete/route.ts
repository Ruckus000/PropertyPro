/**
 * GET    /api/v1/account/delete — Check active deletion request status
 * POST   /api/v1/account/delete — Request account deletion
 * DELETE /api/v1/account/delete — Cancel account deletion
 *
 * User requests, checks, or cancels their own account deletion.
 */
import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import {
  cancelUserDeletion,
  findCoolingDeletionRequestForUser,
  getLatestUserDeletionRequest,
  requestUserDeletion,
} from '@/lib/services/account-lifecycle-service';
import { AppError } from '@/lib/api/errors/AppError';

// GET — check active deletion request
export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  const activeRequest = await getLatestUserDeletionRequest(userId);

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
  return NextResponse.json({ data: request });
});

// DELETE — cancel deletion
export const DELETE = withErrorHandler(async (): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();

  const activeRequestId = await findCoolingDeletionRequestForUser(userId);
  if (activeRequestId === null) {
    throw new AppError('No active deletion request found', 404, 'NOT_FOUND');
  }

  await cancelUserDeletion(activeRequestId, userId);
  return NextResponse.json({ data: { cancelled: true } });
});
