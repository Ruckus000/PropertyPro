/**
 * GET    /api/v1/account/delete — Check active deletion request status
 * POST   /api/v1/account/delete — Request account deletion
 * DELETE /api/v1/account/delete — Cancel account deletion
 *
 * User requests, checks, or cancels their own account deletion.
 *
 * Plan A1 drain #160. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import {
  cancelUserDeletion,
  findCoolingDeletionRequestForUser,
  getLatestUserDeletionRequest,
  requestUserDeletion,
  RootOffboardingAckRequiredError,
} from '@/lib/services/account-lifecycle-service';
import { AppError } from '@/lib/api/errors/AppError';
import { ConflictError } from '@/lib/api/errors/ConflictError';
import { recordSupportAction } from '@/lib/support/support-audit';
import {
  sendDeletionCancelledEmail,
  sendDeletionInitiatedEmail,
} from '@/lib/account-lifecycle/deletion-emails';
import {
  accountDeleteDeleteContract,
  accountDeleteGetContract,
  accountDeletePostContract,
} from './contract';

// route-gate: self-scoped — reads only the caller's own deletion request
export const GET = withErrorHandler(
  runRoute(accountDeleteGetContract, async () => {
    const userId = await requireAuthenticatedUserId();
    const activeRequest = await getLatestUserDeletionRequest(userId);

    if (
      !activeRequest ||
      activeRequest.status === 'cancelled' ||
      activeRequest.status === 'recovered'
    ) {
      return null;
    }

    return activeRequest;
  }),
);

// route-gate: self-scoped — requests deletion of the caller's own account
export const POST = withErrorHandler(
  runRoute(accountDeletePostContract, async ({ body }) => {
    const userId = await requireAuthenticatedUserId();
    await requireFreshReauth(userId);

    let result: Awaited<ReturnType<typeof requestUserDeletion>>;
    try {
      result = await requestUserDeletion(userId, body?.acknowledgeRootOffboarding ?? false);
    } catch (err) {
      // R3-03b: the caller is root somewhere and has not acknowledged it yet.
      // 409 (not 403) — this is a confirmable state, not a refusal; the client
      // re-submits with `acknowledgeRootOffboarding: true`. The affected
      // communities ride along so the prompt can name them, and flag the ones
      // with no successor, which have no self-service recovery.
      if (err instanceof RootOffboardingAckRequiredError) {
        throw new AppError(
          'Deleting your account will leave communities without a root manager.',
          409,
          'ROOT_OFFBOARDING_ACK_REQUIRED',
          { communities: err.communities },
        );
      }
      throw err;
    }

    const { request, created } = result;
    // A repeat request returns the pending one unchanged; it was already
    // announced. Best effort: never throws, so a mail failure cannot turn a
    // committed request into an error the user retries.
    if (created) {
      await sendDeletionInitiatedEmail({
        requestId: request.id,
        userId,
        coolingEndsAt: request.coolingEndsAt,
      });
    }
    return request;
  }),
);

// route-gate: self-scoped — cancels the caller's own pending deletion request
//
// One of the four writes middleware lets through a read_only support session
// (SUPPORT_WRITABLE_API_ROUTES). POST (requesting deletion) is NOT: it needs
// the account holder's own password via requireFreshReauth.
export const DELETE = withErrorHandler(
  runRoute(accountDeleteDeleteContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();

    const activeRequestId = await findCoolingDeletionRequestForUser(userId);
    if (activeRequestId === null) {
      throw new AppError('No active deletion request found', 404, 'NOT_FOUND');
    }

    // Support session: record the cancellation BEFORE making it, fail closed
    // (lib/support/support-audit.ts). `cancelledBy` below still names the
    // impersonated user — the row here is what names the operator. A no-op
    // outside a support session.
    await recordSupportAction(req.headers, {
      event: 'support_deletion_cancelled',
      targetUserId: userId,
      changedFields: ['status', 'cancelledAt', 'cancelledBy'],
      before: { status: 'cooling' },
      // cancelledAt/cancelledBy are stamped by cancelUserDeletion at write time.
      after: { status: 'cancelled' },
      target: { deletionRequestId: activeRequestId },
    });

    const cancelled = await cancelUserDeletion(userId, userId);
    // The cron soft-deleted the request after the lookup above: the account is
    // already deleted, so saying it stays open would be false. Restoring it
    // from here on is a support action.
    if (!cancelled.some((row) => row.id === activeRequestId)) {
      throw new ConflictError(
        'Your account has already been deleted, so this request can no longer be cancelled. Contact support to restore it.',
      );
    }
    // Best effort, never throws (see POST).
    await sendDeletionCancelledEmail({ requestId: activeRequestId, userId });
    return { cancelled: true as const };
  }),
);
