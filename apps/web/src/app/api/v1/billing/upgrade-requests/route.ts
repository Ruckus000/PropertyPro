/**
 * POST /api/v1/billing/upgrade-requests
 *
 * Lets a non-billing community member (owner, board member, site manager)
 * notify the billing-capable users (board president, CAM, PM admin) that
 * they want a plan upgrade. Tenants are denied at this layer.
 *
 * The notification is sent in-app via the notifications table. We do NOT
 * send email here — the request is intentionally low-friction and the
 * notification feed is the right place for the board to act on it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  insertNotifications,
  type InsertNotificationRow,
} from '@propertypro/db';
import {
  canRequestUpgrade,
  inferCanonicalRoleFromMembership,
  PLAN_FEATURES,
  type PlanId,
} from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ForbiddenError } from '@/lib/api/errors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { listBillingCapableUserIds } from '@/lib/services/billing-upgrade-requests-service';

const PLAN_ID_VALUES = Object.keys(PLAN_FEATURES) as PlanId[];

const bodySchema = z.object({
  featureKey: z.string().min(1).max(64).nullable().optional(),
  requestedPlan: z.enum(PLAN_ID_VALUES as [PlanId, ...PlanId[]]).nullable().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);

  // Map the canonical role used by getLockedFeatureBehavior to the new 4-role
  // model present on the membership. Tenant = `resident` + isUnitOwner=false.
  const inferredCanonicalRole = inferCanonicalRoleFromMembership({
    role: membership.role,
    isUnitOwner: membership.isUnitOwner,
    presetKey: membership.presetKey ?? null,
  });
  if (!canRequestUpgrade(inferredCanonicalRole)) {
    throw new ForbiddenError('Tenants cannot request plan upgrades.');
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  const { featureKey, requestedPlan } = parsed.data;

  // Find all billing-capable users in this community (excluding the requester).
  const recipientIds = await listBillingCapableUserIds(communityId, userId);

  if (recipientIds.length === 0) {
    // Nothing to do — but treat as success so the requester sees confirmation.
    return NextResponse.json({ data: { ok: true, notified: 0 } });
  }

  // Use the requester's display title (loaded with membership) so we don't
  // need a second DB round-trip to the global users table.
  const requesterName = membership.displayTitle || 'A community member';

  const planConfig = requestedPlan ? PLAN_FEATURES[requestedPlan] : null;
  const planLabel = planConfig?.displayName ?? 'a higher plan';
  const featureLabel = featureKey ? humanizeFeatureKey(featureKey) : 'a premium feature';

  const sourceId = `${userId}:${featureKey ?? 'unknown'}:${Math.floor(Date.now() / 1000)}`;
  const rows: InsertNotificationRow[] = recipientIds.map((recipientId) => ({
    communityId,
    userId: recipientId,
    category: 'system',
    title: `${requesterName} requested a plan upgrade`,
    body: `${requesterName} is asking to unlock ${featureLabel}. Available on ${planLabel}.`,
    actionUrl: `/settings/billing/change-plan?communityId=${communityId}`,
    sourceType: 'plan_upgrade_request',
    sourceId,
    priority: 'normal',
  }));

  const result = await insertNotifications(rows);
  return NextResponse.json({ data: { ok: true, notified: result.created } });
});

function humanizeFeatureKey(key: string): string {
  return key
    .replace(/^has/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}
