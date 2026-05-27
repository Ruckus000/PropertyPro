/**
 * PR #5: Apply a community-type-matched starter pack to a new community.
 *
 * Called from createCommunityForPm AFTER the community is inserted. Reads
 * the matching site_starter_packs row, then inserts one published
 * site_blocks row per entry in the pack's blocks jsonb.
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
import { eq } from '@propertypro/db/filters';
import type { CommunityType } from '@propertypro/shared';

const STARTER_PACK_SLUG_BY_TYPE: Record<CommunityType, string> = {
  condo_718: 'florida-condo-v1',
  hoa_720: 'florida-hoa-v1',
  apartment: 'apartment-v1',
};

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
  const packSlug = STARTER_PACK_SLUG_BY_TYPE[communityType];

  const scoped = createScopedClient(communityId);
  // queryWhere auto-injects community_id and deleted_at IS NULL; add isDraft=false to find published blocks.
  const existing = await scoped.queryWhere(siteBlocks, eq(siteBlocks.isDraft, false));
  if (existing.length > 0) {
    return { applied: false, blockCount: 0, packSlug };
  }

  const db = createUnscopedClient();
  const packRows = await db
    .select({ blocks: siteStarterPacks.blocks })
    .from(siteStarterPacks)
    .where(eq(siteStarterPacks.slug, packSlug))
    .limit(1);

  const pack = packRows[0];
  if (!pack || !Array.isArray(pack.blocks)) {
    return { applied: false, blockCount: 0, packSlug };
  }

  const blocks = pack.blocks as StarterPackBlock[];
  const now = new Date();

  for (const block of blocks) {
    await scoped.insert(siteBlocks, {
      communityId,
      blockType: block.blockType,
      blockOrder: block.blockOrder,
      isDraft: false,
      publishedAt: now,
      content: block.content,
    });
  }

  return { applied: true, blockCount: blocks.length, packSlug };
}
