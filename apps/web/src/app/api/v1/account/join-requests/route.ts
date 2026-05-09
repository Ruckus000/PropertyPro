/**
 * Account Join Requests API
 *
 * POST /api/v1/account/join-requests — submit a new join request (authenticated user)
 * GET  /api/v1/account/join-requests — list the authenticated user's own join requests
 *
 * The POST endpoint:
 * - requires an authenticated user
 * - rate-limits to 5 submissions per user per day
 * - runs eligibility checks (no existing role, no pending request, no 30-day cooldown)
 * - inserts a community_join_requests row with status='pending' via the
 *   join-requests service (cross-tenant insert lives there).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import {
  ValidationError,
  ConflictError,
  RateLimitError,
} from '@/lib/api/errors';
import { checkJoinRequestEligibility } from '@/lib/join-requests/eligibility';
import {
  createJoinRequest,
  listJoinRequestsForUser,
} from '@/lib/join-requests/approve-request';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';

const createSchema = z.object({
  communityId: z.number().int().positive(),
  unitIdentifier: z.string().trim().min(1).max(50),
  residentType: z.enum(['owner', 'tenant']),
});

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  // Per-user rate limit: 5 submissions / day
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

  const body: unknown = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request');
  }

  const eligibility = await checkJoinRequestEligibility({
    userId,
    communityId: parsed.data.communityId,
  });
  if (!eligibility.eligible) {
    throw new ConflictError(`Cannot submit join request: ${eligibility.reason}`, {
      reason: eligibility.reason,
    });
  }

  const created = await createJoinRequest({
    userId,
    communityId: parsed.data.communityId,
    unitIdentifier: parsed.data.unitIdentifier,
    residentType: parsed.data.residentType,
  });

  return NextResponse.json(
    { data: { requestId: created.id, status: created.status } },
    { status: 201 },
  );
});

export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();
  const rows = await listJoinRequestsForUser(userId);
  return NextResponse.json({ data: rows });
});
