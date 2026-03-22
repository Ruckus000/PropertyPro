/**
 * Access Requests API
 *
 * POST  /api/v1/access-requests  — public: submit a self-service resident access request
 * GET   /api/v1/access-requests  — admin: list pending access requests for review
 *
 * Invariants:
 * - POST is public (no session required) — registered in TOKEN_AUTH_ROUTES
 * - GET requires an authenticated admin with residents.write permission
 * - withErrorHandler for structured errors
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import {
  submitAccessRequest,
  listPendingRequests,
} from '@/lib/services/access-request-service';

const submitSchema = z.object({
  communityId: z.number().int().positive(),
  communitySlug: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
  claimedUnitNumber: z.string().max(100).optional(),
  isUnitOwner: z.boolean().default(false),
  refCode: z.string().max(50).optional(),
});

// ---------------------------------------------------------------------------
// POST — public: submit a resident access request
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation failed');
  }

  const result = await submitAccessRequest(parsed.data);
  return NextResponse.json({ data: result }, { status: 201 });
});

// ---------------------------------------------------------------------------
// GET — admin: list pending access requests
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'residents', 'write');

  const requests = await listPendingRequests(membership.communityId);
  return NextResponse.json({ data: requests });
});
