/**
 * PR #1b: PM site editor — hero block endpoint.
 *
 * PATCH /api/v1/pm/site/hero    — replace the community's published hero block
 *
 * Authorization: caller must hold pm_admin in the target community and the
 * community's subscription plan must include `hasSiteEditor`.
 *
 * PR #1b writes directly to the published row. The full draft/preview/publish
 * workflow ships in PR #8.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { heroBlockSchema } from '@propertypro/shared';
import { upsertPublishedHero } from '@/lib/services/site-blocks-service';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';

const patchBodySchema = z
  .object({
    communityId: z.number().int().positive(),
  })
  .passthrough(); // hero fields are validated below via heroBlockSchema

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const rawBody: unknown = await req.json();
  const envelope = patchBodySchema.safeParse(rawBody);
  if (!envelope.success) {
    throw new ValidationError('Invalid request body', {
      fields: formatZodErrors(envelope.error),
    });
  }

  const { communityId, ...heroFields } = envelope.data;

  const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  if (membership.role !== 'pm_admin') {
    throw new ForbiddenError('Only property managers can edit the community site');
  }
  await requirePlanFeature(effectiveCommunityId, 'hasSiteEditor');

  const heroParse = heroBlockSchema.safeParse(heroFields);
  if (!heroParse.success) {
    throw new ValidationError('Invalid hero block content', {
      fields: formatZodErrors(heroParse.error),
    });
  }

  await upsertPublishedHero({
    communityId: effectiveCommunityId,
    actorUserId: userId,
    content: heroParse.data,
  });

  return NextResponse.json({ data: { ok: true } });
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const rawCommunityId = Number(searchParams.get('communityId'));
  if (!Number.isInteger(rawCommunityId) || rawCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }

  const effectiveCommunityId = resolveEffectiveCommunityId(req, rawCommunityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  if (membership.role !== 'pm_admin') {
    throw new ForbiddenError('Only property managers can edit the community site');
  }
  await requirePlanFeature(effectiveCommunityId, 'hasSiteEditor');

  const reader = getPublicCommunityScopedReader(effectiveCommunityId);
  const blocks = await reader.listSiteBlocks();
  const heroBlock = blocks.find((b) => b.blockType === 'hero');
  return NextResponse.json({ data: { hero: heroBlock?.content ?? null } });
});
