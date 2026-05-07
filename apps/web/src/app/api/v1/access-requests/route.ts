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
 *
 * GET pagination (Plan B3 rollout):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`.
 * - The `status='pending'` filter is pushed into the SQL `where` predicate
 *   instead of the previous in-memory filter on a full-table fetch — this
 *   removes an O(N) anti-pattern that scaled with total access-request volume,
 *   not just the pending subset.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: AccessRequest[], pagination: { nextCursor, hasMore, pageSize } } }`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { accessRequests, createScopedClient, paginate } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { submitAccessRequest } from '@/lib/services/access-request-service';

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

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
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
  const { searchParams } = req.nextUrl;
  const rawCommunityId = searchParams.get('communityId');
  const parsedCommunityId = rawCommunityId ? Number(rawCommunityId) : null;
  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'residents', 'write');

  // Use `||` not `??` so empty-string query params (`?cursor=`, `?pageSize=`)
  // are treated as missing rather than passed to Zod, which would 400 on the
  // `min(1)` / `positive()` constraints.
  const parsedQuery = listQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid query parameters');
  }

  const scoped = createScopedClient(membership.communityId);
  const result = await paginate(
    scoped,
    accessRequests,
    { cursor: parsedQuery.data.cursor, pageSize: parsedQuery.data.pageSize },
    { where: eq(accessRequests.status, 'pending') },
  );

  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
});
