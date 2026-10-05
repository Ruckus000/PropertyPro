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
 * AUTHZ: caller MUST have just created the community, or be provisioning a
 * demo. `createCommunityForPm` calls this immediately after inserting the
 * creator as the community's root_manager, so there is no prior membership to
 * verify; the demo seed and `applyStarterPackToDemoCommunity` (demo entry,
 * after the demo instance is validated) write only to demo communities. Reads platform-level catalog via unscoped client, inserts via
 * scoped client.
 */
import { communities, createScopedClient, siteBlocks, sitePages, siteStarterPacks } from '@propertypro/db';
// AUTHZ: PR #5 starter pack lookup — siteStarterPacks is platform-level catalog; caller verifies community creation.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, desc, eq, sql } from '@propertypro/db/filters';
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

    return { applied: true, blockCount: blocks.length, packSlug };
  });
}

/**
 * Starter sections for a demo community, on entry. Demo communities are built
 * by `seedCommunity` (the admin app's demo creation and the local demo seed),
 * which, unlike `createCommunityForPm`, applies no starter pack: a prospect
 * opening the website editor found an empty page.
 *
 * The admin app cannot import this service, so the web app's demo entry routes
 * call it instead, which also fills demos created before this existed. A no-op
 * for a community that is not a demo, or that has published sections.
 *
 * A community that has ever had a section row (a draft, or one removed: removal
 * soft-deletes) is left alone, so a prospect who empties the site keeps it
 * empty.
 *
 * ponytail: runs on every demo entry (two small reads once filled), and the
 * removed rows it relies on are purged after 30 days (`cleanupSoftDeletedSiteBlocks`),
 * about a demo's lifetime. Moving this into `seedCommunity` (it needs
 * `ensureHomePage` in packages/db) ends both.
 *
 * Best-effort, like `createCommunityForPm`'s call: a failure is logged and
 * never blocks the entry.
 */
export async function applyStarterPackToDemoCommunity(communityId: number): Promise<void> {
  try {
    const scoped = createScopedClient(communityId);
    const [community] = (await scoped.selectFrom(
      communities,
      { communityType: communities.communityType, isDemo: communities.isDemo },
      eq(communities.id, communityId),
    )) as unknown as Array<{ communityType: CommunityType; isDemo: boolean }>;
    if (!community?.isDemo) return;
    // Removed rows included: they are the point here.
    if ((await scoped.queryIncludingDeleted(siteBlocks)).length > 0) return;
    await applyStarterPackToCommunity(communityId, community.communityType);
  } catch (err) {
    console.error('applyStarterPackToDemoCommunity failed', { communityId, err });
  }
}
