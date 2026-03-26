/**
 * Emergency Broadcasts API — list + create.
 *
 * GET  /api/v1/emergency-broadcasts — List broadcasts (paginated)
 * POST /api/v1/emergency-broadcasts — Create broadcast draft + resolve recipients
 *
 * Emergency broadcasts bypass subscription guard (life-safety over revenue).
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
  listBroadcasts,
} from '@/lib/services/emergency-broadcast-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

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

  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  const result = await listBroadcasts(communityId, limit, offset);

  return NextResponse.json({
    data: result.broadcasts,
    total: result.total,
    limit,
    offset,
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

  return NextResponse.json(result, { status: 201 });
});
