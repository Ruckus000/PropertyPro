/**
 * Multi-page support for a community's public site (website editor v3, Phase 11).
 *
 * Two tables: `site_pages` (the pages themselves) and `site_page_redirects` (the
 * slug history that keeps an old printed URL working after a rename).
 *
 * ONE ROW PER PAGE — not the draft/published row PAIR `site_blocks` uses.
 * `site_blocks.page_id` points at a page and the new
 * `site_blocks_community_page_order_draft_partial` index keys per-page ordering
 * on it, so a page needs ONE stable identity; a pair would leave `page_id`
 * ambiguous between the two halves. `is_draft` therefore means "created but
 * never published" (anon RLS hides such a page) and `published_at` records the
 * last publish. Consequence, and it is a Phase 11b decision rather than
 * something this schema settles: renaming an ALREADY-published page is
 * live-immediate unless 11b adds draft columns for name/slug.
 *
 * RENAMES ALWAYS KEEP A REDIRECT (gap-analysis decision 11). Association URLs
 * get printed in mailed notices and cited in governing documents, so a rename
 * must not break an old link and there is no toggle. That is why the slug
 * history is a RELATION and not a single `redirect_from` column: a page renamed
 * three times has to honour all three old slugs. A slug held by a redirect is
 * also RESERVED — a new page cannot claim it, which `pageIssues()` reports in
 * words in 11b.
 *
 * SLUG VALIDATION IS TWO-LAYERED, DELIBERATELY. The CHECK constraints here
 * enforce SHAPE only (lowercase, no traversal, non-empty except home). The
 * RESERVED-name rule stays in the app layer, where `isReservedPublicSlug()`
 * (apps/web/src/lib/middleware/public-host-routes.ts) derives it from
 * `PROTECTED_FIRST_SEGMENTS` — the routing rule and the validator must never
 * become two lists that drift, and SQL cannot read that list.
 *
 * RLS POSTURE — `public_read_service_write`, mirroring `site_blocks`: the
 * public site renders these rows for anonymous visitors, so anon and
 * authenticated get a published-rows-only SELECT scoped to the
 * `app.current_community_id` GUC, and every write is service-role. Both tables
 * are trigger-exempt for the same reason `site_blocks` is — there is no
 * authenticated write path for `pp_rls_enforce_tenant_community_id()` to
 * police. Policies ship in migration 0046.
 *
 * STILL OWED BY PHASE 11c (gate G3, a deploy wait — only after 11b is live in
 * production): drop `site_blocks_community_order_draft_partial` and
 * `SET NOT NULL` on `site_blocks.page_id`. Keeping both until then is what
 * makes 11b revertible.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';

/**
 * Shape a non-home page slug must match. Home is the empty string.
 *
 * Kept as a literal inside the CHECK expressions below rather than
 * interpolated: a `${}` value in a drizzle `sql` template becomes a bound
 * parameter, which DDL cannot take.
 */
export const SITE_PAGE_SLUG_PATTERN = '^[a-z0-9][a-z0-9-]*$';

export const sitePages = pgTable(
  'site_pages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** PM-facing page name; also the nav label. */
    name: text('name').notNull(),
    /**
     * The URL segment, WITHOUT a leading slash. `''` for the home page, which
     * is pinned at `/`. Lowercase-only by CHECK, which is also what makes
     * `/Docs` and `/docs` unable to coexist.
     */
    slug: text('slug').notNull(),
    /** Whether the page appears in the public site's nav. */
    inNav: boolean('in_nav').notNull().default(true),
    /** Nav order. */
    sortOrder: integer('sort_order').notNull().default(0),
    /** The system page at `/`. At most one live row per community. */
    isHome: boolean('is_home').notNull().default(false),
    /** "Created but never published" — see the header. */
    isDraft: boolean('is_draft').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Slug uniqueness per community. Combined with the lowercase-only CHECK
    // below this is also the case-collision guard.
    uniqueIndex('site_pages_community_slug_partial')
      .on(table.communityId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    // One home page per community.
    uniqueIndex('site_pages_community_home_partial')
      .on(table.communityId)
      .where(sql`${table.isHome} AND ${table.deletedAt} IS NULL`),
    // Nav rendering and the pages manager are both "this community, in order".
    index('site_pages_community_nav_idx').on(table.communityId, table.sortOrder),
    // Referenced target for the COMPOSITE foreign keys on site_blocks and
    // site_page_redirects — see the note on `sitePageRedirects` below. Redundant
    // with the primary key on its own; it exists so `(community_id, id)` can be
    // an FK target.
    unique('site_pages_community_id_id_key').on(table.communityId, table.id),
    check(
      'site_pages_slug_shape_check',
      sql`(${table.isHome} AND ${table.slug} = '') OR (NOT ${table.isHome} AND ${table.slug} ~ '^[a-z0-9][a-z0-9-]*$')`,
    ),
  ],
);

export const sitePageRedirects = pgTable(
  'site_page_redirects',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** A slug the page used to live at. Never `''` — home cannot be renamed. */
    fromSlug: text('from_slug').notNull(),
    /**
     * The page that slug now resolves to. The FK is COMPOSITE — see the table
     * extras below — so the page is guaranteed to belong to `communityId`.
     */
    pageId: bigint('page_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // A retired slug resolves to exactly one page, and is reserved against new
    // pages claiming it.
    uniqueIndex('site_page_redirects_community_from_slug_partial')
      .on(table.communityId, table.fromSlug)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      'site_page_redirects_from_slug_shape_check',
      sql`${table.fromSlug} ~ '^[a-z0-9][a-z0-9-]*$'`,
    ),
    // COMPOSITE FK, not a plain page_id reference. A single-column FK would
    // permit a redirect in community A pointing at community B's page, and the
    // cascade below would then make deleting B's page mutate A's data. Pairing
    // community_id into the FK makes that unrepresentable in the database
    // instead of relying on every future write path to re-check it.
    foreignKey({
      name: 'site_page_redirects_community_page_fk',
      columns: [table.communityId, table.pageId],
      foreignColumns: [sitePages.communityId, sitePages.id],
    }).onDelete('cascade'),
  ],
);
