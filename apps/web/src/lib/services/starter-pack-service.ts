/**
 * PR #5: Apply a community-type-matched starter pack to a new community.
 *
 * Called from createCommunityForPm AFTER the community is inserted. Selects
 * the highest-version, non-archived site_starter_packs row for the
 * community_type (ties broken by id desc), then inserts one published
 * site_blocks row per entry in the pack's blocks jsonb. No-ops when every
 * pack for the type is archived (or none exists).
 *
 * Idempotent: if the community already has any published site_blocks,
 * skip the apply.
 *
 * AUTHZ: caller MUST have just created the community (or verified
 * pm_admin membership). Reads platform-level catalog via unscoped client,
 * inserts via scoped client.
 */
import { createScopedClient, siteBlocks, siteStarterPacks } from '@propertypro/db';
// AUTHZ: PR #5 starter pack lookup — siteStarterPacks is platform-level catalog; caller verifies community creation.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, desc, eq } from '@propertypro/db/filters';
import { ensureHomePage } from '@/lib/services/site-pages-service';
import type { CommunityType } from '@propertypro/shared';

interface StarterPackBlock {
  blockType: string;
  blockOrder: number;
  content: Record<string, unknown>;
}

export interface ApplyStarterPackResult {
  applied: boolean;
  blockCount: number;
  packSlug: string | null;
}

export async function applyStarterPackToCommunity(
  communityId: number,
  communityType: CommunityType,
): Promise<ApplyStarterPackResult> {
  const scoped = createScopedClient(communityId);
  // queryWhere auto-injects community_id and deleted_at IS NULL; add isDraft=false to find published blocks.
  const existing = await scoped.queryWhere(siteBlocks, eq(siteBlocks.isDraft, false));
  if (existing.length > 0) {
    return { applied: false, blockCount: 0, packSlug: null };
  }

  const db = createUnscopedClient();
  // Latest non-archived pack for this community type. `version` is the
  // authority for "latest" (the slug's -vN suffix is a human label only);
  // `id desc` breaks ties deterministically.
  const packRows = await db
    .select({ slug: siteStarterPacks.slug, blocks: siteStarterPacks.blocks })
    .from(siteStarterPacks)
    .where(and(eq(siteStarterPacks.communityType, communityType), eq(siteStarterPacks.isArchived, false)))
    .orderBy(desc(siteStarterPacks.version), desc(siteStarterPacks.id))
    .limit(1);

  const pack = packRows[0];
  if (!pack || !Array.isArray(pack.blocks)) {
    return { applied: false, blockCount: 0, packSlug: null };
  }
  const packSlug = pack.slug;

  const blocks = pack.blocks as StarterPackBlock[];
  const now = new Date();

  // Phase 11b: the starter pack is the "site is already live" path for a
  // brand-new community, so it is also where that community's home page comes
  // from. Without this the blocks land with `page_id` NULL — invisible to the
  // multi-page editor and a guaranteed failure when 11c sets the column NOT NULL.
  //
  // Created as PUBLISHED with the same stamp the blocks carry: a starter pack is
  // live immediately, so the page it lives on has to be too, or anon RLS hides
  // the page while serving its blocks. The `publishedAt` option exists for this
  // caller — at this point there are no blocks for `ensureHomePage` to derive
  // published-ness from.
  const homePageId = await ensureHomePage(communityId, undefined, { publishedAt: now });

  // Inserts are independent (blockOrder is set explicitly per block);
  // run them concurrently to avoid N sequential roundtrips.
  //
  // KNOWN LIMITATION: Promise.all rejects on the first failure but the other
  // inserts may still complete. So a partial failure can leave the community
  // with an unknown subset of starter blocks landed. The caller
  // (createCommunityForPm) catches and logs — it does NOT roll back the
  // community. The idempotency guard above means a manual re-apply or a
  // future "reset to starter" tool (PR #6) will short-circuit cleanly rather
  // than double-insert. Atomic batch insertion is part of the PR #8 publish
  // workflow redesign.
  await Promise.all(
    blocks.map((block) =>
      scoped.insert(siteBlocks, {
        communityId,
        pageId: homePageId,
        blockType: block.blockType,
        blockOrder: block.blockOrder,
        isDraft: false,
        publishedAt: now,
        content: block.content,
      }),
    ),
  );

  return { applied: true, blockCount: blocks.length, packSlug };
}
