/**
 * Emergency Broadcasts API — list + create.
 *
 * GET  /api/v1/emergency-broadcasts — paginated list (Plan B3 rollout)
 * POST /api/v1/emergency-broadcasts — Create broadcast draft + resolve recipients
 *
 * Emergency broadcasts bypass subscription guard (life-safety over revenue).
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`,
 *   wrapped behind `paginateEmergencyBroadcasts()` on the service so the
 *   route doesn't need to import the table or scoped client directly.
 * - Order by `id` desc — equivalent to the previous `desc(initiatedAt)` since
 *   `initiated_at` is `defaultNow()` at insert time (monotonic with bigserial id).
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: EmergencyBroadcast[], pagination } }`.
 *
 * **Bug fix**: the prior service `listBroadcasts` loaded ALL broadcasts into
 * memory before JS-slicing to the requested page (no SQL LIMIT/OFFSET). And
 * the consumer hook `useEmergencyBroadcasts` didn't pass a page param, so
 * communities with >20 historical broadcasts could never see the rest. The
 * hook now walks all pages via `walkPaginated` (capped at MAX_PAGES *
 * pageSize = 2000), so the full history is available.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { UnprocessableEntityError } from '@/lib/api/errors/UnprocessableEntityError';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  createBroadcast,
  paginateEmergencyBroadcasts,
} from '@/lib/services/emergency-broadcast-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

// ── Schemas ─────────────────────────────────────────────────────────────────

const createBroadcastSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1, 'Title is required').max(500),
  body: z.string().min(1, 'Body is required').max(5000),
  smsBody: z.string().max(1600).optional(),
  severity: z.enum(['emergency', 'urgent', 'info']).default('emergency'),
  templateKey: z.string().optional(),
  targetAudience: z.enum(['all', 'owners_only']).default('all'),
  channels: z.array(z.enum(['sms', 'email'])).min(1, 'At least one channel required').default(['sms', 'email']),
});

// ── GET — List broadcasts ───────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityIdParam = searchParams.get('communityId');

  if (!communityIdParam) {
    throw new ValidationError('communityId query parameter is required');
  }

  const parsedCommunityId = Number(communityIdParam);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'emergency_broadcasts', 'read');

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

  const result = await paginateEmergencyBroadcasts({
    communityId,
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
  });

  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
});

// ── POST — Create broadcast draft ──────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = await req.json();

  const parsed = createBroadcastSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid broadcast request', { fields: formatZodErrors(parsed.error) });
  }

  const { communityId, ...rest } = parsed.data;
  const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
  await assertNotDemoGrace(effectiveCommunityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership, 'emergency_broadcasts', 'write');

  // NOTE: No requireActiveSubscriptionForMutation() — life-safety bypass

  const result = await createBroadcast({
    communityId: effectiveCommunityId,
    ...rest,
    initiatedBy: userId,
  });

  return NextResponse.json(result);
});
