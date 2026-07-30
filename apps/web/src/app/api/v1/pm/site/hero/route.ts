/**
 * PR #1b: PM site editor — hero block endpoint.
 *
 * GET  /api/v1/pm/site/hero?communityId=X   — read current hero (draft wins)
 * PATCH /api/v1/pm/site/hero                — upsert the hero draft
 *
 * Authorization: caller must hold pm_admin or cam in the target community and the
 * community's subscription plan must include `hasSiteEditor`.
 *
 * Slice 8e is live: PATCH writes a draft row; the public site keeps serving
 * the last-published hero until POST /api/v1/pm/site/publish promotes it.
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
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
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
  return { userId, communityId: effective, membership };
}

export const GET = withErrorHandler(
  runRoute(heroBlockGetContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    const reader = getPublicCommunityScopedReader(communityId);
    // PR #8e — the editor view merges draft + published (draft wins). If a
    // hero draft exists, return it so the editor form seeds with the draft
    // content the PM is iterating on.
    // Phase 11b: the hero lives on the HOME page only — slot 1 is the hero by
    // convention and, while the pre-11a 3-column index survives, exactly one row
    // per community can hold it. Unfiltered, `find` could return another page's
    // block if one ever carried the type.
    const homePageId = await reader.getHomePageId();
    const blocks = await reader.listSiteBlocks({
      includeDrafts: true,
      ...(homePageId === null ? {} : { pageId: homePageId }),
    });
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
    //
    // EVERY stored path goes through this, not just the legacy single image.
    // `photos[]` would otherwise route straight around a control this route
    // deliberately has — the check is invisible from the schema, so a new
    // path-bearing field is exactly how it gets lost.
    const scopedPaths: { field: string; value: string }[] = [
      ...(heroParse.data.heroImagePath
        ? [{ field: 'heroImagePath', value: heroParse.data.heroImagePath }]
        : []),
      ...(heroParse.data.photos ?? []).map((photo, index) => ({
        field: `photos.${index}.path`,
        value: photo.path,
      })),
    ];
    for (const { field, value } of scopedPaths) {
      if (!value.startsWith(`${communityId}/`)) {
        throw new ValidationError(`${field} must reference this community`, {
          fields: [
            {
              field,
              message: `Path must start with "${communityId}/" (got "${value.slice(0, 32)}…")`,
            },
          ],
        });
      }
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
