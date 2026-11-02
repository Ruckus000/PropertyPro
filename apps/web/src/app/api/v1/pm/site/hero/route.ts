/**
 * PR #1b: PM site editor — hero block endpoint.
 *
 * GET  /api/v1/pm/site/hero?communityId=X   — read current hero (draft wins)
 * PATCH /api/v1/pm/site/hero                — upsert the hero draft, or with
 *                                             `live: true` the published hero
 *
 * Authorization: caller must hold a management role (property_manager / root_manager) in the target community and the
 * community's subscription plan must include `hasSiteEditor`.
 *
 * Slice 8e is live: PATCH writes a draft row; the public site keeps serving
 * the last-published hero until POST /api/v1/pm/site/publish promotes it.
 *
 * `live: true` (the website home's Edit words / Change photo) writes the
 * published row instead, so the public site shows it on the next request. If a
 * hero draft exists it is overwritten with the same content, so a later
 * publish from the editor cannot bring the older words back: the newest edit
 * wins. Undo is the client saving the previous content back the same way.
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
import {
  assertPathsScopedToCommunity,
  collectBlockAssetPaths,
} from '@/lib/site-assets/scoped-paths';
import { upsertPublishedHero } from '@/lib/services/site-blocks-service';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { heroBlockGetContract, heroBlockPatchContract } from './contract';
import type { NextRequest } from 'next/server';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

async function ensurePmAccess(
  req: NextRequest,
  communityId: number,
  { write = true }: { write?: boolean } = {},
) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  // A demo in its grace window is read-only. Before membership, per api-patterns.md.
  if (write) await assertNotDemoGrace(effective);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can edit the community site');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

/** A hero draft on the home page: the row a later editor publish would promote. */
async function hasHeroDraft(communityId: number): Promise<boolean> {
  const reader = getPublicCommunityScopedReader(communityId);
  const homePageId = await reader.getHomePageId();
  const blocks = await reader.listSiteBlocks({
    includeDrafts: true,
    ...(homePageId === null ? {} : { pageId: homePageId }),
  });
  return blocks.some((block) => block.blockType === 'hero' && block.isDraft);
}

export const GET = withErrorHandler(
  runRoute(heroBlockGetContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId, {
      write: false,
    });
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
    const { communityId: rawCommunityId, live = false, ...heroFields } = body;
    const { userId, communityId } = await ensurePmAccess(req, rawCommunityId);

    const heroParse = heroBlockSchema.safeParse(heroFields);
    if (!heroParse.success) {
      throw new ValidationError('Invalid hero block content', {
        fields: formatZodErrors(heroParse.error),
      });
    }

    // Defense-in-depth: imagePathSchema only enforces the shape
    // `{numeric}/{kind}/...` — it does not bind the leading numeric segment
    // to the editing community. A property_manager for community 42 could
    // PATCH a heroImagePath of `999/hero/x.webp` and the row would persist
    // a cross-tenant reference. The storage bucket is anon-readable by
    // design (no access boundary crossed), but the schema's own contract
    // says the leading segment IS the community id, so enforce it here.
    //
    // EVERY stored path goes through this, not just the legacy single image.
    // `photos[]` would otherwise route straight around a control this route
    // deliberately has — the check is invisible from the schema, so a new
    // path-bearing field is exactly how it gets lost.
    //
    // The check now lives in `@/lib/site-assets/scoped-paths` and is shared
    // with the blocks route, which had no equivalent and accepted foreign
    // `imagePath` / `images[].imagePath` values. Behaviour here is unchanged.
    assertPathsScopedToCommunity(
      communityId,
      collectBlockAssetPaths('hero', heroParse.data),
    );

    if (!live) {
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
    }

    // ponytail: an edited welcome is saved as literal text and stops tracking
    // name/city/units. Trigger: a community renames or changes unit count and
    // its welcome goes stale.
    await upsertPublishedHero({
      communityId,
      actorUserId: userId,
      content: heroParse.data,
      isDraft: false,
    });

    // ponytail: live write and draft overwrite are two transactions; a failed
    // second leaves a stale draft, nothing lost. Trigger: a support report of a
    // publish restoring old welcome words.
    if (await hasHeroDraft(communityId)) {
      await upsertPublishedHero({
        communityId,
        actorUserId: userId,
        content: heroParse.data,
        isDraft: true,
      });
    }

    return { ok: true as const };
  }),
);
