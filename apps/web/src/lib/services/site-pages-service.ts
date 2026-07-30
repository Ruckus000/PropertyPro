/**
 * Site Pages Service — multi-page public site (website editor v3, Phase 11b).
 *
 * Mutation entry points for `site_pages` and its slug history
 * (`site_page_redirects`). Same posture as its sibling
 * `site-blocks-service.ts`: authenticated management-tier writes only, scoped
 * via `createScopedClient`, audit-logged inside the same transaction as the
 * mutation, serialized against publish/reorder through the community row lock.
 *
 * THREE SEMANTICS WORTH READING BEFORE EDITING THIS FILE.
 *
 * 1. RENAMES ARE LIVE-IMMEDIATE, AND ALWAYS LEAVE A REDIRECT. A rename changes
 *    the public URL at once — there are no draft name/slug columns. What
 *    protects the old address is `site_page_redirects`: renaming a PUBLISHED
 *    page mints a row for the slug it vacated, permanently. Association URLs get
 *    printed in mailed notices and cited in governing documents, so this is not
 *    optional and there is no toggle (gap-analysis decision 11).
 *
 * 2. DELETING A PUBLISHED PAGE IS STAGED, deleting an unpublished one is not.
 *    `delete_staged_at` (migration 0047) is the page equivalent of a
 *    `site_blocks` tombstone draft: the page stays live and publicly readable
 *    until `publishCommunitySite` applies the removal. A page that has never
 *    been published has nothing live to protect and goes immediately.
 *
 * 3. `block_order` IS COMMUNITY-WIDE UNTIL PHASE 11c. The pre-11a index
 *    `site_blocks_community_order_draft_partial (community_id, block_order,
 *    is_draft)` is still live — it is STRICTER than the new 4-column one — so two
 *    pages cannot both hold slot 2, and only the home page can hold slot 1 (the
 *    hero). Non-home pages are content-only, at community-unique orders. 11c
 *    drops that index and unlocks per-page numbering; nothing here should
 *    pre-empt it.
 *
 * AUTHZ: callers (route layer) MUST verify management-tier (property_manager /
 * root_manager) membership and the `hasSiteEditor` plan feature. Pages are NOT
 * behind a plan flag of their own — they ship wherever the site editor does.
 */
import {
  complianceAuditLog,
  createScopedClient,
  siteBlocks,
  sitePageRedirects,
  sitePages,
  type AuditAction,
} from '@propertypro/db';
import { and, asc, desc, eq, isNull, sql } from '@propertypro/db/filters';
// AUTHZ: Phase 11b multi-page — caller (route layer) verifies management-tier (property_manager / root_manager) + hasSiteEditor.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { isReservedPublicSlug } from '@/lib/middleware/public-host-routes';

/**
 * Shape a non-home slug must match. Duplicated from the DB CHECK
 * (`site_pages_slug_shape_check`) on purpose — the constraint is the backstop,
 * this is what turns a bad slug into a readable 400 instead of an opaque 500 on
 * a raw constraint violation.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** The home page's slug. It is pinned at `/` and cannot be renamed. */
const HOME_SLUG = '';

/** Home is always first in the nav; created pages start after it. */
const HOME_SORT_ORDER = 0;

const MAX_PAGE_NAME_LENGTH = 60;
const MAX_SLUG_LENGTH = 60;

/** Defensive cap on the reorder payload — a nav is tens of pages, not thousands. */
const MAX_PAGES_PER_COMMUNITY = 200;

export interface SitePageRecord {
  id: number;
  name: string;
  slug: string;
  inNav: boolean;
  sortOrder: number;
  isHome: boolean;
  isDraft: boolean;
  publishedAt: Date | null;
  deleteStagedAt: Date | null;
}

type UnscopedDb = ReturnType<typeof createUnscopedClient>;
/**
 * The drizzle transaction handle. Every internal helper takes this rather than a
 * loosened structural type, so the query builders stay fully typed — and so the
 * publish transaction in `site-blocks-service.ts` can hand its own `tx` to
 * `ensureHomePage` and have the work join that transaction.
 */
type Tx = Parameters<Parameters<UnscopedDb['transaction']>[0]>[0];

function scopedFor(communityId: number, tx: Tx) {
  return createScopedClient(
    communityId,
    tx as unknown as Parameters<typeof createScopedClient>[1],
  );
}

/** Same narrowed executor shape (and reason) as site-blocks-service.ts. */
type AuditInsertExecutor = {
  insert(table: typeof complianceAuditLog): {
    values(payload: Record<string, unknown>): Promise<unknown>;
  };
};

async function insertAuditEventInTransaction(
  tx: Tx,
  params: {
    userId: string | null;
    action: AuditAction;
    resourceId: string;
    communityId: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await (tx as unknown as AuditInsertExecutor).insert(complianceAuditLog).values({
    userId: params.userId,
    communityId: params.communityId,
    action: params.action,
    resourceType: 'site_page',
    resourceId: params.resourceId,
    metadata: params.metadata ?? null,
  });
}

/** Serializes against publish/reorder/remove for this community. */
async function lockCommunity(tx: Tx, communityId: number): Promise<void> {
  await tx.execute(sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`);
}

const PAGE_COLUMNS = {
  id: sitePages.id,
  name: sitePages.name,
  slug: sitePages.slug,
  inNav: sitePages.inNav,
  sortOrder: sitePages.sortOrder,
  isHome: sitePages.isHome,
  isDraft: sitePages.isDraft,
  publishedAt: sitePages.publishedAt,
  deleteStagedAt: sitePages.deleteStagedAt,
} as const;

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

/**
 * Returns the community's home page id, creating it if absent.
 *
 * Migration 0046's backfill created a home page only for communities that
 * ALREADY had `site_blocks` rows. Three populations therefore reach this
 * function without one:
 *
 *   - a community that has never touched the site editor;
 *   - a community created between 0046 being applied and 11b-1 shipping, whose
 *     starter pack wrote published blocks with `page_id` NULL;
 *   - anything an out-of-band writer (the admin app's raw-SQL template routes)
 *     inserted without a page.
 *
 * So this ALSO adopts any of the community's page-less blocks — the same
 * `page_id` UPDATE the migration ran, scoped to one community. That makes the
 * function self-healing rather than merely lazy, which matters because 11c sets
 * `page_id NOT NULL` and every NULL left behind is a failed migration.
 *
 * `is_draft` is derived exactly as 0046's backfill derived it: published if any
 * live block of the community is published, draft otherwise. A community with no
 * blocks at all gets a draft home page, which anon RLS hides — correct, since it
 * has no public site yet.
 *
 * Idempotent. Pass `tx` to join an existing transaction (the publish path does);
 * omit it and one is opened.
 */
export async function ensureHomePage(
  communityId: number,
  tx?: Tx,
  options: EnsureHomePageOptions = {},
): Promise<number> {
  if (tx) return ensureHomePageInTransaction(communityId, tx, options);
  const db = createUnscopedClient();
  return db.transaction((ownTx) => ensureHomePageInTransaction(communityId, ownTx, options));
}

export interface EnsureHomePageOptions {
  /**
   * Create the page already PUBLISHED, stamped with this value, instead of
   * deriving its state from the community's existing blocks.
   *
   * For the starter pack, which writes published blocks for a brand-new
   * community: at the moment the page is created there are no blocks to derive
   * from yet, so the default would produce a draft home page carrying live
   * content — invisible to the public site while its own blocks are visible.
   * Ignored when the page already exists (never flips an existing draft live).
   */
  publishedAt?: Date;
}

async function ensureHomePageInTransaction(
  communityId: number,
  tx: Tx,
  { publishedAt }: EnsureHomePageOptions = {},
): Promise<number> {
  const existing = await findHomePageId(communityId, tx);
  if (existing !== null) {
    await adoptPagelessBlocks(communityId, existing, tx);
    return existing;
  }

  const publishedStamp = publishedAt ?? (await newestPublishedBlockStamp(communityId, tx));
  const inserted = await scopedFor(communityId, tx).insert(sitePages, {
    communityId,
    name: 'Home',
    slug: HOME_SLUG,
    inNav: true,
    sortOrder: HOME_SORT_ORDER,
    isHome: true,
    isDraft: publishedStamp === null,
    publishedAt: publishedStamp,
  });
  const id = (inserted as unknown as { id: number }[])[0]?.id;
  if (id === undefined) {
    throw new Error('ensureHomePage: insert returned no row');
  }
  await adoptPagelessBlocks(communityId, id, tx);
  return id;
}

async function findHomePageId(communityId: number, tx: Tx): Promise<number | null> {
  const rows = await tx
    .select({ id: sitePages.id })
    .from(sitePages)
    .where(
      and(
        eq(sitePages.communityId, communityId),
        eq(sitePages.isHome, true),
        isNull(sitePages.deletedAt),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The newest `published_at` among the community's live published blocks, or null
 * when it has none. Gives a lazily-created home page a stamp that agrees with
 * the site it describes.
 */
async function newestPublishedBlockStamp(
  communityId: number,
  tx: Tx,
): Promise<Date | null> {
  const rows = await tx
    .select({ publishedAt: siteBlocks.publishedAt })
    .from(siteBlocks)
    .where(
      and(
        eq(siteBlocks.communityId, communityId),
        eq(siteBlocks.isDraft, false),
        isNull(siteBlocks.deletedAt),
      ),
    )
    .orderBy(desc(siteBlocks.publishedAt))
    .limit(1);
  return rows[0]?.publishedAt ?? null;
}

/**
 * Points any of the community's page-less blocks at `pageId`.
 *
 * Deliberately NOT filtered on `deleted_at`: 11c's `SET NOT NULL` sees
 * soft-deleted rows too, so leaving a tombstoned row NULL only defers the
 * failure. Same reasoning as 0046's backfill UPDATE.
 */
async function adoptPagelessBlocks(
  communityId: number,
  pageId: number,
  tx: Tx,
): Promise<void> {
  await tx
    .update(siteBlocks)
    .set({ pageId })
    .where(and(eq(siteBlocks.communityId, communityId), isNull(siteBlocks.pageId)));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListSitePagesOptions {
  /**
   * Include pages that have never been published (`is_draft = true`). The PM
   * editor passes true; anything public-facing must NOT.
   */
  includeDrafts?: boolean;
}

/**
 * The community's pages in nav order (home first). Ensures the home page exists,
 * so a brand-new community's editor opens on a real page rather than an empty
 * list it cannot act on.
 */
export async function listSitePages(
  communityId: number,
  { includeDrafts = false }: ListSitePagesOptions = {},
): Promise<SitePageRecord[]> {
  const db = createUnscopedClient();
  return db.transaction(async (tx) => {
    await ensureHomePageInTransaction(communityId, tx);
    return listPagesInTransaction(communityId, tx, { includeDrafts });
  });
}

async function listPagesInTransaction(
  communityId: number,
  tx: Tx,
  { includeDrafts = true }: ListSitePagesOptions = {},
): Promise<SitePageRecord[]> {
  const conditions = [eq(sitePages.communityId, communityId), isNull(sitePages.deletedAt)];
  if (!includeDrafts) {
    conditions.push(eq(sitePages.isDraft, false));
  }
  return tx
    .select(PAGE_COLUMNS)
    .from(sitePages)
    .where(and(...conditions))
    .orderBy(desc(sitePages.isHome), asc(sitePages.sortOrder), asc(sitePages.id));
}

async function loadPage(
  communityId: number,
  pageId: number,
  tx: Tx,
): Promise<SitePageRecord> {
  const rows = await tx
    .select(PAGE_COLUMNS)
    .from(sitePages)
    .where(
      and(
        eq(sitePages.communityId, communityId),
        eq(sitePages.id, pageId),
        isNull(sitePages.deletedAt),
      ),
    )
    .limit(1);
  const page = rows[0];
  if (!page) {
    throw new NotFoundError('Page not found for this community');
  }
  return page;
}

// ---------------------------------------------------------------------------
// Slug and name validation
// ---------------------------------------------------------------------------

/**
 * Rejects a slug the community cannot use, with a message a PM can act on.
 *
 * Four failure modes, and RESERVED is the security-relevant one: a community
 * subdomain also serves the authenticated app, so a page at `/documents` would
 * be shadowed by the app route forever — and would present as a broken public
 * page rather than an error anyone could diagnose. The list comes from
 * `isReservedPublicSlug`, which derives it from `PROTECTED_FIRST_SEGMENTS`.
 * Never re-list the names here: the routing rule and the validator must not
 * become two lists that drift.
 */
export async function assertUsableSlug(
  communityId: number,
  slug: string,
  tx: Tx,
  { excludePageId }: { excludePageId?: number } = {},
): Promise<void> {
  if (slug.length === 0) {
    throw new ValidationError('Give the page a web address.', {
      fields: [{ field: 'slug', message: 'A page address cannot be empty.' }],
    });
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new ValidationError('That web address is too long.', {
      fields: [{ field: 'slug', message: `Use ${MAX_SLUG_LENGTH} characters or fewer.` }],
    });
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError('That web address is not valid.', {
      fields: [
        {
          field: 'slug',
          message:
            'Use lowercase letters, numbers and hyphens only, starting with a letter or number.',
        },
      ],
    });
  }
  if (isReservedPublicSlug(slug)) {
    throw new ValidationError('That web address is reserved.', {
      fields: [
        {
          field: 'slug',
          message: `"/${slug}" is used by the resident portal, so a public page cannot live there. Pick another address.`,
        },
      ],
    });
  }

  const clashes = await tx
    .select({ id: sitePages.id })
    .from(sitePages)
    .where(
      and(
        eq(sitePages.communityId, communityId),
        eq(sitePages.slug, slug),
        isNull(sitePages.deletedAt),
      ),
    )
    .limit(2);
  if (clashes.some((row) => row.id !== excludePageId)) {
    throw new ValidationError('Another page already uses that web address.', {
      fields: [{ field: 'slug', message: `"/${slug}" is taken by another page.` }],
    });
  }

  // A retired slug is reserved: a redirect still forwards visitors to whichever
  // page replaced it, and letting a new page claim the address would hijack
  // every printed link to the old one.
  //
  // EXCEPT when the redirect points at THIS page. Renaming `/about` to
  // `/about-us` and then changing your mind is an undo, not a hijack — the
  // redirect being reclaimed is the one this page itself left behind. The caller
  // (`updateSitePage`) deletes that row as part of the rename.
  const heldByRedirect = await tx
    .select({ id: sitePageRedirects.id, pageId: sitePageRedirects.pageId })
    .from(sitePageRedirects)
    .where(
      and(
        eq(sitePageRedirects.communityId, communityId),
        eq(sitePageRedirects.fromSlug, slug),
        isNull(sitePageRedirects.deletedAt),
      ),
    )
    .limit(1);
  if (heldByRedirect.length > 0 && heldByRedirect[0]?.pageId !== excludePageId) {
    throw new ValidationError('Another page used to live at that web address.', {
      fields: [
        {
          field: 'slug',
          message: `"/${slug}" still forwards visitors to the page that replaced it. Pick another address.`,
        },
      ],
    });
  }
}

function assertUsableName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Give the page a name.', {
      fields: [{ field: 'name', message: 'A page name cannot be empty.' }],
    });
  }
  if (trimmed.length > MAX_PAGE_NAME_LENGTH) {
    throw new ValidationError('That page name is too long.', {
      fields: [
        { field: 'name', message: `Use ${MAX_PAGE_NAME_LENGTH} characters or fewer.` },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateSitePageInput {
  communityId: number;
  actorUserId: string;
  name: string;
  slug: string;
  inNav?: boolean;
}

/**
 * Creates an unpublished page. It is invisible to the public (anon RLS filters
 * `is_draft`) until the PM publishes, so creating one is never a live change.
 */
export async function createSitePage({
  communityId,
  actorUserId,
  name,
  slug,
  inNav = true,
}: CreateSitePageInput): Promise<SitePageRecord> {
  assertUsableName(name);
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    await lockCommunity(tx, communityId);
    await ensureHomePageInTransaction(communityId, tx);
    await assertUsableSlug(communityId, slug, tx);

    const highest = await tx
      .select({ sortOrder: sitePages.sortOrder })
      .from(sitePages)
      .where(and(eq(sitePages.communityId, communityId), isNull(sitePages.deletedAt)))
      .orderBy(desc(sitePages.sortOrder))
      .limit(1);
    const nextSortOrder = (highest[0]?.sortOrder ?? HOME_SORT_ORDER) + 1;

    const inserted = await scopedFor(communityId, tx).insert(sitePages, {
      communityId,
      name: name.trim(),
      slug,
      inNav,
      sortOrder: nextSortOrder,
      isHome: false,
      isDraft: true,
      publishedAt: null,
    });
    const page = (inserted as unknown as SitePageRecord[])[0];
    if (!page) throw new Error('createSitePage: insert returned no row');

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      communityId,
      action: 'create',
      resourceId: String(page.id),
      metadata: { name: page.name, slug: page.slug, inNav },
    });

    return page;
  });
}

// ---------------------------------------------------------------------------
// Update (rename / nav visibility)
// ---------------------------------------------------------------------------

export interface UpdateSitePageInput {
  communityId: number;
  actorUserId: string;
  pageId: number;
  name?: string;
  slug?: string;
  inNav?: boolean;
}

export interface UpdateSitePageResult {
  page: SitePageRecord;
  /** The slug a redirect now covers, or null when the address did not change. */
  redirectedFrom: string | null;
}

/**
 * Renames a page and/or toggles its nav visibility. LIVE-IMMEDIATE — see the
 * file header.
 *
 * A slug change on a PUBLISHED page mints a permanent redirect from the old
 * address. A slug change on an unpublished page does not: nothing has ever
 * pointed at that address, so a redirect would reserve a slug nobody ever used.
 *
 * The home page's address cannot change (it is pinned at `/`), but its NAME can —
 * that name is its nav label.
 */
export async function updateSitePage({
  communityId,
  actorUserId,
  pageId,
  name,
  slug,
  inNav,
}: UpdateSitePageInput): Promise<UpdateSitePageResult> {
  if (name === undefined && slug === undefined && inNav === undefined) {
    throw new ValidationError('Nothing to update.');
  }
  if (name !== undefined) assertUsableName(name);

  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    await lockCommunity(tx, communityId);

    const current = await loadPage(communityId, pageId, tx);
    if (current.isHome && slug !== undefined && slug !== current.slug) {
      throw new ValidationError('The home page always lives at the site root.', {
        fields: [{ field: 'slug', message: 'The home page address cannot be changed.' }],
      });
    }

    const slugChanged = slug !== undefined && slug !== current.slug && !current.isHome;
    if (slugChanged) {
      await assertUsableSlug(communityId, slug, tx, { excludePageId: pageId });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates['name'] = name.trim();
    if (slugChanged) updates['slug'] = slug;
    if (inNav !== undefined) updates['inNav'] = inNav;

    const scoped = scopedFor(communityId, tx);

    // Reclaiming this page's OWN former address: drop the redirect that held it,
    // or the page and a redirect would both answer for the same slug — and the
    // unique index would refuse the new redirect minted below when the PM renames
    // away again.
    if (slugChanged) {
      await scoped.softDelete(
        sitePageRedirects,
        and(
          eq(sitePageRedirects.pageId, pageId),
          eq(sitePageRedirects.fromSlug, slug),
          isNull(sitePageRedirects.deletedAt),
        ),
      );
    }

    await scoped.update(sitePages, updates, eq(sitePages.id, pageId));

    // Mint the redirect only for a published page — and only AFTER the update,
    // so the vacated slug is genuinely free under
    // `site_page_redirects_community_from_slug_partial`.
    let redirectedFrom: string | null = null;
    if (slugChanged && !current.isDraft) {
      await scoped.insert(sitePageRedirects, {
        communityId,
        fromSlug: current.slug,
        pageId,
      });
      redirectedFrom = current.slug;
    }

    const page = await loadPage(communityId, pageId, tx);

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceId: String(pageId),
      metadata: { name: page.name, slug: page.slug, inNav: page.inNav, redirectedFrom },
    });

    return { page, redirectedFrom };
  });
}

// ---------------------------------------------------------------------------
// Nav order
// ---------------------------------------------------------------------------

export interface ReorderSitePagesInput {
  communityId: number;
  actorUserId: string;
  /**
   * Every non-home page id, in the order they should appear in the nav. Home is
   * pinned first and must NOT appear here.
   */
  orderedPageIds: number[];
}

/**
 * Rewrites nav order. Takes the full ordered list rather than a move
 * instruction: the pages manager renders a list the PM drags, and a full list
 * makes the request idempotent and impossible to apply half-way.
 */
export async function reorderSitePages({
  communityId,
  actorUserId,
  orderedPageIds,
}: ReorderSitePagesInput): Promise<SitePageRecord[]> {
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    await lockCommunity(tx, communityId);

    const live = await tx
      .select({ id: sitePages.id, isHome: sitePages.isHome })
      .from(sitePages)
      .where(and(eq(sitePages.communityId, communityId), isNull(sitePages.deletedAt)))
      .limit(MAX_PAGES_PER_COMMUNITY);
    const reorderable = live.filter((row) => !row.isHome).map((row) => row.id);

    // Reject a partial or stale list outright. Applying one would silently
    // renumber pages the client never mentioned.
    const submitted = new Set(orderedPageIds);
    if (
      submitted.size !== orderedPageIds.length ||
      submitted.size !== reorderable.length ||
      reorderable.some((id) => !submitted.has(id))
    ) {
      throw new ValidationError(
        'The page order is out of date. Reload the editor and try again.',
      );
    }

    const scoped = scopedFor(communityId, tx);
    let sortOrder = HOME_SORT_ORDER + 1;
    for (const id of orderedPageIds) {
      await scoped.update(sitePages, { sortOrder }, eq(sitePages.id, id));
      sortOrder += 1;
    }

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceId: String(communityId),
      metadata: { reordered: orderedPageIds },
    });

    return listPagesInTransaction(communityId, tx);
  });
}

// ---------------------------------------------------------------------------
// Delete (staged for published pages)
// ---------------------------------------------------------------------------

export interface StageSitePageDeleteInput {
  communityId: number;
  actorUserId: string;
  pageId: number;
}

export interface StageSitePageDeleteResult {
  /**
   * true  — the page was published; the removal is staged and the page stays
   *         live until the next publish.
   * false — the page had never been published; it is gone already.
   */
  staged: boolean;
}

/**
 * Removes a page. Staged for a published page, immediate for one that has never
 * been published — see the file header.
 *
 * The home page cannot be removed: every layout renders a site root, and there
 * is no coherent public site without one.
 */
export async function stageSitePageDelete({
  communityId,
  actorUserId,
  pageId,
}: StageSitePageDeleteInput): Promise<StageSitePageDeleteResult> {
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    await lockCommunity(tx, communityId);

    const page = await loadPage(communityId, pageId, tx);
    if (page.isHome) {
      throw new ValidationError('The home page cannot be removed.');
    }

    const scoped = scopedFor(communityId, tx);
    if (page.isDraft) {
      // Never published: drop the page and its draft blocks outright. The blocks
      // are soft-deleted explicitly rather than left to the composite FK
      // cascade, which only fires on a HARD delete.
      await scoped.softDelete(siteBlocks, eq(siteBlocks.pageId, pageId));
      await scoped.softDelete(sitePages, eq(sitePages.id, pageId));
    } else {
      await scoped.update(
        sitePages,
        { deleteStagedAt: new Date() },
        eq(sitePages.id, pageId),
      );
    }

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      communityId,
      action: 'delete',
      resourceId: String(pageId),
      metadata: { name: page.name, slug: page.slug, staged: !page.isDraft },
    });

    return { staged: !page.isDraft };
  });
}

export interface UnstageSitePageDeleteInput {
  communityId: number;
  actorUserId: string;
  pageId: number;
}

/** Cancels a staged removal — the undo the publish sheet offers. */
export async function unstageSitePageDelete({
  communityId,
  actorUserId,
  pageId,
}: UnstageSitePageDeleteInput): Promise<SitePageRecord> {
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    await lockCommunity(tx, communityId);

    const page = await loadPage(communityId, pageId, tx);
    if (page.deleteStagedAt === null) {
      throw new ValidationError('That page is not staged for removal.');
    }

    await scopedFor(communityId, tx).update(
      sitePages,
      { deleteStagedAt: null },
      eq(sitePages.id, pageId),
    );

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceId: String(pageId),
      metadata: { name: page.name, slug: page.slug, unstagedDelete: true },
    });

    return loadPage(communityId, pageId, tx);
  });
}
