import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  ensureTransparencyChecklistInitialized,
  getTransparencySettings,
  setTransparencySettings,
} from '@/lib/services/transparency-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const communityIdQuerySchema = z.coerce.number().int().positive();

const patchSchema = z
  .object({
    communityId: z.number().int().positive(),
    enabled: z.boolean(),
    acknowledged: z.boolean().optional(),
  })
  .strict();

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const parsedCommunityId = communityIdQuerySchema.safeParse(searchParams.get('communityId'));

  if (!parsedCommunityId.success) {
    throw new ValidationError('Invalid or missing communityId query parameter');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId.data);
  const membership = await requireCommunityMembership(communityId, userId);
  const features = getFeaturesForCommunity(membership.communityType);

  if (!features.hasTransparencyPage) {
    throw new NotFoundError('Transparency settings are not available for this community type');
  }

  requirePermission(membership, 'settings', 'read');

  const settings = await getTransparencySettings(communityId);
  if (!settings) {
    throw new NotFoundError('Community not found');
  }

  return NextResponse.json({
    data: {
      enabled: settings.enabled,
      acknowledgedAt: settings.acknowledgedAt
        ? settings.acknowledgedAt.toISOString()
        : null,
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsedBody = patchSchema.safeParse(body);

  if (!parsedBody.success) {
    throw new ValidationError('Invalid transparency settings payload');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedBody.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  const features = getFeaturesForCommunity(membership.communityType);

  if (!features.hasTransparencyPage) {
    throw new NotFoundError('Transparency settings are not available for this community type');
  }

  requirePermission(membership, 'settings', 'write');

  const current = await getTransparencySettings(communityId);
  if (!current) {
    throw new NotFoundError('Community not found');
  }

  let acknowledgedAt = current.acknowledgedAt;

  if (parsedBody.data.enabled) {
    const checklistRows = await ensureTransparencyChecklistInitialized(
      communityId,
      membership.communityType,
    );

    if (checklistRows.length === 0) {
      throw new ValidationError('Generate your compliance checklist before enabling transparency');
    }

    if (!acknowledgedAt) {
      if (parsedBody.data.acknowledged !== true) {
        throw new ValidationError('Transparency scope acknowledgment is required before enabling');
      }
      acknowledgedAt = new Date();
    }
  }

  await setTransparencySettings(communityId, {
    enabled: parsedBody.data.enabled,
    acknowledgedAt,
  });

  await logAuditEvent({
    userId,
    action: 'settings_changed',
    resourceType: 'transparency',
    resourceId: String(communityId),
    communityId,
    oldValues: {
      enabled: current.enabled,
      acknowledgedAt: current.acknowledgedAt ? current.acknowledgedAt.toISOString() : null,
    },
    newValues: {
      enabled: parsedBody.data.enabled,
      acknowledgedAt: acknowledgedAt ? acknowledgedAt.toISOString() : null,
    },
  });

  return NextResponse.json({
    data: {
      enabled: parsedBody.data.enabled,
      acknowledgedAt: acknowledgedAt ? acknowledgedAt.toISOString() : null,
    },
  });
});
