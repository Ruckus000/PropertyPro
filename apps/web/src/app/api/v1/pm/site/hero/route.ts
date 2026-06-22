/**
 * PR #1b: PM site editor — hero block endpoint.
 *
 * GET  /api/v1/pm/site/hero?communityId=X   — read current published hero
 * PATCH /api/v1/pm/site/hero                — replace published hero
 *
 * Authorization: caller must hold pm_admin or cam in the target community and the
 * community's subscription plan must include `hasSiteEditor`.
 *
 * PR #1b writes directly to the published row. The full draft/preview/publish
 * workflow ships in PR #8.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { heroBlockSchema } from '@propertypro/shared';
import { upsertPublishedHero } from '@/lib/services/site-blocks-service';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { heroBlockGetContract, heroBlockPatchContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can edit the community site');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const GET = withErrorHandler(
  runRoute(heroBlockGetContract, async ({ query, req }) => {
    const { communityId } = await ensurePmAccess(req, query.communityId);
    const reader = getPublicCommunityScopedReader(communityId);
    // PR #8e — the editor view merges draft + published (draft wins). If a
    // hero draft exists, return it so the editor form seeds with the draft
    // content the PM is iterating on.
    const blocks = await reader.listSiteBlocks({ includeDrafts: true });
    const heroBlock = blocks.find((b) => b.blockType === 'hero');
    return {
      hero: heroBlock?.content ?? null,
      isDraft: heroBlock?.isDraft ?? false,
      publishedAt: heroBlock?.publishedAt ? heroBlock.publishedAt.toISOString() : null,
    };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(heroBlockPatchContract, async ({ body, req }) => {
    const { communityId: rawCommunityId, ...heroFields } = body;
    const { userId, communityId } = await ensurePmAccess(req, rawCommunityId);

    const heroParse = heroBlockSchema.safeParse(heroFields);
    if (!heroParse.success) {
      throw new ValidationError('Invalid hero block content', {
        fields: formatZodErrors(heroParse.error),
      });
    }

    // Defense-in-depth: imagePathSchema only enforces the shape
    // `{numeric}/{kind}/...` — it does not bind the leading numeric segment
    // to the editing community. A pm_admin for community 42 could otherwise
    // PATCH a heroImagePath of `999/hero/x.webp` and the row would persist
    // a cross-tenant reference. The storage bucket is anon-readable by
    // design (no access boundary crossed), but the schema's own contract
    // says the leading segment IS the community id, so enforce it here.
    if (
      heroParse.data.heroImagePath &&
      !heroParse.data.heroImagePath.startsWith(`${communityId}/`)
    ) {
      throw new ValidationError('heroImagePath must reference this community', {
        fields: [
          {
            field: 'heroImagePath',
            message: `Path must start with "${communityId}/" (got "${heroParse.data.heroImagePath.slice(0, 32)}…")`,
          },
        ],
      });
    }

    // PR #8e — hero edits write to the draft row at block_order=1. The
    // public site continues to serve the last-published hero until the PM
    // clicks Publish.
    await upsertPublishedHero({
      communityId,
      actorUserId: userId,
      content: heroParse.data,
      isDraft: true,
    });

    return { ok: true as const };
  }),
);
