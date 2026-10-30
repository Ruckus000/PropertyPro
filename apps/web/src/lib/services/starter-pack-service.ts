/**
 * PR #5: Apply a community-type-matched starter pack to a community.
 *
 * No longer how a new community gets its site: `seedNewCommunitySite` publishes
 * the suggested look instead (`site-look-service`'s `applyLookAtCreation`), and a
 * prospect demo gets the same on entry (`fillDemoCommunitySite`). This still
 * serves the seeded fixtures (`scripts/seed-demo.ts`,
 * `scripts/help-capture/fixtures.ts`), which are shared test data with their own
 * consumers, and the tests that need a site on a type's legacy layout. Admin's
 * "reset to starter" has its own implementation in apps/admin. A site on a
 * legacy layout can still be holding any version of a pack, which is why a look
 * switch reads every version (`site-look-service`).
 *
 * Selects the highest-version, non-archived site_starter_packs row for the
 * community_type (ties broken by id desc), then inserts one published
 * site_blocks row per entry in the pack's blocks jsonb. No-ops when every
 * pack for the type is archived (or none exists).
 *
 * Idempotent: if the community already has any published site_blocks,
 * skip the apply.
 *
 * AUTHZ: caller MUST have just created the community, or be seeding a fixture:
 * the demo seed and the help-capture fixtures write only to the communities
 * they create. Reads platform-level catalog via unscoped client, inserts via
 * scoped client.
 */
import { communities, createScopedClient, siteBlocks, sitePages, siteStarterPacks } from '@propertypro/db';
// AUTHZ: PR #5 starter pack lookup — siteStarterPacks is platform-level catalog; caller verifies community creation.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, desc, eq, isNull, sql } from '@propertypro/db/filters';
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
  // queryWhere auto-injects community_id and deleted_at IS NULL; add isDraft=false to find published blocks.
  const hasPublishedBlocks = async (scoped: ReturnType<typeof createScopedClient>) =>
    (await scoped.queryWhere(siteBlocks, eq(siteBlocks.isDraft, false))).length > 0;
  // Unlocked fast path: every demo entry after the first ends here.
  if (await hasPublishedBlocks(createScopedClient(communityId))) {
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

  // One transaction holding the community row lock, the same lock publish,
  // reorder, remove and `ensureHomePage` take. The admin preview opens a demo's
  // board and resident links together: without the lock, two first entries
  // both pass the check above and the loser fails on the section-order unique
  // index instead of finding the pack there. It also makes the inserts
  // all-or-nothing.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`);
    const scoped = createScopedClient(communityId, tx as unknown as Parameters<typeof createScopedClient>[1]);
    // Again under the lock: a racing entry may have applied it since.
    if (await hasPublishedBlocks(scoped)) {
      return { applied: false, blockCount: 0, packSlug: null };
    }

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
    const homePageId = await ensureHomePage(communityId, tx, { publishedAt: now });
    // A home page can already exist, as a draft, when the editor was opened
    // before the pack (a demo entered before demos got one): `ensureHomePage`
    // never flips an existing draft live. Nothing on the site is published yet,
    // so the page goes live with the pack rather than hide it.
    await tx
      .update(sitePages)
      .set({ isDraft: false, publishedAt: now })
      .where(and(eq(sitePages.id, homePageId), eq(sitePages.isDraft, true)));

    for (const block of blocks) {
      await scoped.insert(siteBlocks, {
        communityId,
        pageId: homePageId,
        blockType: block.blockType,
        blockOrder: block.blockOrder,
        isDraft: false,
        publishedAt: now,
        content: block.content,
      });
    }

    // Applying the pack IS a publish, so stamp what `publishCommunitySite` stamps
    // (its Step 5d). Without it the site is live but the urgent-notice gate and
    // admin's live status read the community as never published. Never
    // overwrites an existing stamp, the same rule as migration 0043.
    await tx
      .update(communities)
      .set({ sitePublishedAt: now })
      .where(and(eq(communities.id, communityId), isNull(communities.sitePublishedAt)));

    return { applied: true, blockCount: blocks.length, packSlug };
  });
}
