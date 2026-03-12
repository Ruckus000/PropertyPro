import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  communities,
  createScopedClient,
  logAuditEvent,
} from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { ensureTransparencyChecklistInitialized } from '@/lib/services/transparency-service';

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

  const scoped = createScopedClient(communityId);
  const communityRows = await scoped.query(communities);
  const community = communityRows.find((row) => row['id'] === communityId);
  if (!community) {
    throw new NotFoundError('Community not found');
  }

  const acknowledgedAt = community['transparencyAcknowledgedAt'];

  return NextResponse.json({
    data: {
      enabled: community['transparencyEnabled'] === true,
      acknowledgedAt:
        acknowledgedAt instanceof Date
          ? acknowledgedAt.toISOString()
          : typeof acknowledgedAt === 'string'
            ? acknowledgedAt
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
  const membership = await requireCommunityMembership(communityId, userId);
  const features = getFeaturesForCommunity(membership.communityType);

  if (!features.hasTransparencyPage) {
    throw new NotFoundError('Transparency settings are not available for this community type');
  }

  requirePermission(membership, 'settings', 'write');

  const scoped = createScopedClient(communityId);
  const communityRows = await scoped.query(communities);
  const community = communityRows.find((row) => row['id'] === communityId);
  if (!community) {
    throw new NotFoundError('Community not found');
  }

  const currentlyEnabled = community['transparencyEnabled'] === true;
  const acknowledgedAtValue = community['transparencyAcknowledgedAt'];
  const existingAcknowledgedAt =
    acknowledgedAtValue instanceof Date
      ? acknowledgedAtValue
      : typeof acknowledgedAtValue === 'string'
        ? new Date(acknowledgedAtValue)
        : null;

  let acknowledgedAt =
    existingAcknowledgedAt && !Number.isNaN(existingAcknowledgedAt.getTime())
      ? existingAcknowledgedAt
      : null;

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

  await scoped.update(communities, {
    transparencyEnabled: parsedBody.data.enabled,
    transparencyAcknowledgedAt: acknowledgedAt,
  });

  await logAuditEvent({
    userId,
    action: 'settings_changed',
    resourceType: 'transparency',
    resourceId: String(communityId),
    communityId,
    oldValues: {
      enabled: currentlyEnabled,
      acknowledgedAt: existingAcknowledgedAt ? existingAcknowledgedAt.toISOString() : null,
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
