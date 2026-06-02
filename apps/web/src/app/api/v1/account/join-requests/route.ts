/**
 * Account Join Requests API
 *
 * POST /api/v1/account/join-requests — submit a new join request (authenticated user)
 * GET  /api/v1/account/join-requests — list the authenticated user's own join requests
 *
 * Plan A1 drain #151. Migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ConflictError, RateLimitError } from '@/lib/api/errors';
import { checkJoinRequestEligibility } from '@/lib/join-requests/eligibility';
import {
  createJoinRequest,
  listJoinRequestsForUser,
} from '@/lib/join-requests/approve-request';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import {
  accountJoinRequestsCreateContract,
  accountJoinRequestsListContract,
} from './contract';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const POST = withErrorHandler(
  runRoute(accountJoinRequestsCreateContract, async ({ body }) => {
    const userId = await requireAuthenticatedUserId();

    const rate = getRateLimiter().check(
      `join-request-submit:${userId}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rate.allowed) {
      throw new RateLimitError(
        `You've submitted too many join requests today. Try again in ${rate.retryAfter}s.`,
      );
    }

    const eligibility = await checkJoinRequestEligibility({
      userId,
      communityId: body.communityId,
    });
    if (!eligibility.eligible) {
      throw new ConflictError(`Cannot submit join request: ${eligibility.reason}`, {
        reason: eligibility.reason,
      });
    }

    const created = await createJoinRequest({
      userId,
      communityId: body.communityId,
      unitIdentifier: body.unitIdentifier,
      residentType: body.residentType,
    });

    return { requestId: created.id, status: created.status };
  }),
);

export const GET = withErrorHandler(
  runRoute(accountJoinRequestsListContract, async () => {
    const userId = await requireAuthenticatedUserId();
    return listJoinRequestsForUser(userId);
  }),
);
