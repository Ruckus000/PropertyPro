/**
 * Public-site community reader.
 *
 * AUTHZ: The public site at `/_site` runs UNAUTHENTICATED. There is no
 * session, no TenantContext, so `createScopedClient()` would throw
 * TenantContextMissing. This helper wraps `createUnscopedClient()` with
 * explicit community_id + deletedAt predicates on every read.
 *
 * The caller (the public-site page) MUST have already validated the
 * communityId via the middleware-injected `x-community-id` header before
 * invoking this helper. Do NOT call this from any authenticated route —
 * use `createScopedClient(communityId)` from `@propertypro/db` instead.
 *
 * In PR #1a, the read methods are stubbed (return empty arrays / null).
 * Real implementations land in subsequent PRs:
 *   - PR #1a: listSiteBlocks (this PR — drives the page render)
 *   - PR #3: listAnnouncements
 *   - PR #4: listDocuments, listMeetings, getContactInfo
 *
 * PR #4 — Documents note:
 * The documentCategories table stores category names (e.g. "budget", "minutes").
 * There is no slug column. The documentsBlockSchema enum values ('budget',
 * 'minutes', 'financial', 'rules', 'other') are matched against the name
 * column directly. A future migration may add a slug column; until then the
 * name field acts as the slug.
 */
import { cache } from 'react';
import { announcements, communities, documentCategories, documents, meetings, siteBlocks, userRoles, users } from '@propertypro/db';
// AUTHZ: Public-site reader — unauthenticated context, no TenantContext available; every method applies an explicit community_id predicate.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, asc, desc, eq, gte, inArray, isNull, lte } from '@propertypro/db/filters';
import { BOARD_DESIGNATIONS, TOMBSTONE_BLOCK_TYPE, isBoardPresident } from '@propertypro/shared';

export interface PublicAnnouncement {
  id: number;
  title: string;
  body: string; // HTML — caller must sanitize before rendering
  isPinned: boolean;
  publishedAt: Date;
}

export interface PublicSiteBlock {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
  /**
   * PR #8e — exposed so the PM editor can count drafts and so the public-site
   * preview can sanity-check what it renders. The public-site Layout
   * component ignores these fields.
   */
  isDraft: boolean;
  publishedAt: Date | null;
}

export interface PublicDocument {
  id: number;
  title: string;
  description: string | null;
  filePath: string;
  fileName: string;
  /**
   * Category name from documentCategories.name (e.g. "budget", "minutes").
   * Null when the document has no category.
   *
   * Note: the documentCategories table has no slug column; the name field
   * acts as the identifier. The documentsBlockSchema enum values are matched
   * against this field.
   */
  categoryName: string | null;
  createdAt: Date;
}

/** Minimal projection used by sitemap.xml — id + dates only, no PII. */
export interface PublicSitemapDocument {
  id: number;
  updatedAt: Date;
}

export interface PublicMeeting {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
}

export interface PublicContactInfo {
  management: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  board: Array<{
    name: string;
    title: string;
  }>;
}

export interface PublicScopedReader {
  readonly communityId: number;

  /**
   * Returns the community's non-deleted site blocks in order.
   *
   * Default: published only (is_draft=false). With `includeDrafts: true`
   * (preview mode, PR #8c) drafts are included and a draft row at a given
   * block_order shadows the published row at the same slot. The partial
   * unique index permits one draft + one published per slot to coexist;
   * the dedupe runs in JS after fetch.
   */
  listSiteBlocks(opts?: {
    includeDrafts?: boolean;
    /**
     * Slice 8f — include tombstone drafts (staged deletions) in the result.
     * Only the PM editor's blocks GET sets this (the PublishBar counts them
     * as pending changes); renderers leave it unset so a tombstoned slot is
     * simply absent. No effect without includeDrafts (tombstones are never
     * published).
     */
    includeTombstones?: boolean;
  }): Promise<PublicSiteBlock[]>;

  /** PR #3 — published, non-expired announcements. */
  listAnnouncements(opts: { limit: number; timeWindowDays?: number | null }): Promise<PublicAnnouncement[]>;

  /**
   * Documents filtered by `public_access = true` AND category name.
   *
   * Returns [] when includeCategories is empty/missing — categories narrow
   * the listing further but are no longer the sole access control (migration
   * 0007 added the publicAccess boolean as the authoritative gate).
   */
  listDocuments(opts: { limit: number; includeCategories?: string[] }): Promise<PublicDocument[]>;

  /**
   * Every public-access document for the community, oldest-stable-id-first
   * (so paginated sitemaps stay consistent across requests). Powers
   * apps/web/src/app/sitemap.ts. Differs from listDocuments by ignoring the
   * category filter — sitemap surfaces every public document.
   */
  listPublicDocumentsForSitemap(opts: { limit: number }): Promise<PublicSitemapDocument[]>;

  /** PR #4 — upcoming meetings within window. */
  listMeetings(opts: { limit: number; timeWindowDays: number }): Promise<PublicMeeting[]>;

  /** PR #4 follow-up — community management contact + public board roster. */
  getContactInfo(opts: { showBoard: boolean; showManagement: boolean }): Promise<PublicContactInfo>;
}

/**
 * Wrapped in React.cache so multiple block renderers on a single public-site
 * request share a single reader instance + per-method DB results within the
 * same request (matches the established pattern on getCommunityPublicInfo,
 * apps/web/src/lib/api/branding.ts:35). Without this, a page rendering
 * Documents + Meetings + Announcements blocks would create three readers and
 * re-issue every query per block.
 */
export const getPublicCommunityScopedReader = cache(_getPublicCommunityScopedReader);

function _getPublicCommunityScopedReader(communityId: number): PublicScopedReader {
  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(
      `getPublicCommunityScopedReader: communityId must be a positive integer; got ${communityId}`,
    );
  }

  const db = createUnscopedClient();

  return {
    communityId,

    async listSiteBlocks(opts) {
      const includeDrafts = opts?.includeDrafts === true;
      const includeTombstones = opts?.includeTombstones === true;
      const conditions = [
        eq(siteBlocks.communityId, communityId),
        isNull(siteBlocks.deletedAt),
      ];
      if (!includeDrafts) {
        conditions.push(eq(siteBlocks.isDraft, false));
      }
      const rows = await db
        .select({
          id: siteBlocks.id,
          blockType: siteBlocks.blockType,
          blockOrder: siteBlocks.blockOrder,
          content: siteBlocks.content,
          isDraft: siteBlocks.isDraft,
          publishedAt: siteBlocks.publishedAt,
        })
        .from(siteBlocks)
        .where(and(...conditions))
        .orderBy(asc(siteBlocks.blockOrder));

      // Draft-wins dedupe per block_order. The partial unique index allows
      // one draft + one published row to coexist at the same slot; in preview
      // mode the draft replaces the published row.
      if (includeDrafts) {
        const byOrder = new Map<number, typeof rows[number]>();
        for (const row of rows) {
          const existing = byOrder.get(row.blockOrder);
          if (!existing || (row.isDraft && !existing.isDraft)) {
            byOrder.set(row.blockOrder, row);
          }
        }
        // Tombstone drafts (staged deletions, slice 8f) participate in the
        // merge — the tombstone WINS over the published row it shadows — and
        // are then dropped, so a staged deletion renders as an absent
        // section in preview. The PM editor's blocks GET opts in via
        // includeTombstones so the pending-changes count covers staged
        // deletions. Tombstones are never published, so the published-only
        // branch below needs no filter.
        return [...byOrder.values()]
          .filter((r) => includeTombstones || r.blockType !== TOMBSTONE_BLOCK_TYPE)
          .sort((a, b) => a.blockOrder - b.blockOrder)
          .map((r) => ({
            id: r.id,
            blockType: r.blockType,
            blockOrder: r.blockOrder,
            content: r.content,
            isDraft: r.isDraft,
            publishedAt: r.publishedAt,
          }));
      }

      return rows.map((r) => ({
        id: r.id,
        blockType: r.blockType,
        blockOrder: r.blockOrder,
        content: r.content,
        isDraft: r.isDraft,
        publishedAt: r.publishedAt,
      }));
    },

    async listAnnouncements(opts) {
      const conditions = [
        eq(announcements.communityId, communityId),
        eq(announcements.audience, 'all'),
        isNull(announcements.archivedAt),
        isNull(announcements.deletedAt),
        lte(announcements.publishedAt, new Date()),
      ];
      if (opts.timeWindowDays != null) {
        const cutoff = new Date(Date.now() - opts.timeWindowDays * 24 * 60 * 60 * 1000);
        conditions.push(gte(announcements.publishedAt, cutoff));
      }
      const rows = await db
        .select({
          id: announcements.id,
          title: announcements.title,
          body: announcements.body,
          isPinned: announcements.isPinned,
          publishedAt: announcements.publishedAt,
        })
        .from(announcements)
        .where(and(...conditions))
        .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt))
        .limit(opts.limit);

      return rows;
    },

    async listDocuments(opts) {
      // Migration 0007 added documents.publicAccess as the authoritative
      // access boundary. Category selection still narrows the listing per
      // PM config, but it's an additional filter rather than the sole gate.
      // Returns [] when no categories are specified (preserves the existing
      // contract — a DocumentsBlock with no category selection is a no-op).
      if (!opts.includeCategories || opts.includeCategories.length === 0) return [];
      const rows = await db
        .select({
          id: documents.id,
          title: documents.title,
          description: documents.description,
          filePath: documents.filePath,
          fileName: documents.fileName,
          categoryName: documentCategories.name,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .leftJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
        .where(
          and(
            eq(documents.communityId, communityId),
            isNull(documents.deletedAt),
            eq(documents.publicAccess, true),
            inArray(documentCategories.name, opts.includeCategories),
          ),
        )
        .orderBy(desc(documents.createdAt))
        .limit(opts.limit);
      return rows;
    },

    async listPublicDocumentsForSitemap(opts) {
      // Sitemap surface — every public, non-deleted document for the
      // community, regardless of category. Sorted by id asc so crawlers see
      // a stable order across requests (createdAt could shift if a document
      // is reuploaded). Minimal projection — sitemap only needs id + a
      // lastmod date.
      const rows = await db
        .select({
          id: documents.id,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .where(
          and(
            eq(documents.communityId, communityId),
            isNull(documents.deletedAt),
            eq(documents.publicAccess, true),
          ),
        )
        .orderBy(asc(documents.id))
        .limit(opts.limit);
      return rows;
    },

    async listMeetings(opts) {
      const cutoff = new Date(Date.now() + opts.timeWindowDays * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          id: meetings.id,
          title: meetings.title,
          meetingType: meetings.meetingType,
          startsAt: meetings.startsAt,
          endsAt: meetings.endsAt,
          location: meetings.location,
        })
        .from(meetings)
        .where(
          and(
            eq(meetings.communityId, communityId),
            isNull(meetings.deletedAt),
            gte(meetings.startsAt, new Date()),
            lte(meetings.startsAt, cutoff),
          ),
        )
        .orderBy(asc(meetings.startsAt))
        .limit(opts.limit);
      return rows;
    },

    async getContactInfo(opts) {
      const [communityRows, boardRows] = await Promise.all([
        opts.showManagement
          ? db
            .select({
              contactName: communities.contactName,
              contactEmail: communities.contactEmail,
              contactPhone: communities.contactPhone,
            })
            .from(communities)
            .where(and(eq(communities.id, communityId), isNull(communities.deletedAt)))
            .limit(1)
          : Promise.resolve([]),
        opts.showBoard
          ? db
            .select({
              fullName: users.fullName,
              displayTitle: userRoles.displayTitle,
              designation: userRoles.designation,
            })
            .from(userRoles)
            .innerJoin(users, eq(users.id, userRoles.userId))
            .where(
              and(
                eq(userRoles.communityId, communityId),
                // Phase 3.2 (§3.2): the statutory board IS the set of designation
                // holders, regardless of role. presetKey is no longer consulted.
                inArray(userRoles.designation, [...BOARD_DESIGNATIONS]),
                isNull(users.deletedAt),
              ),
            )
            .orderBy(asc(userRoles.displayTitle), asc(users.fullName))
          : Promise.resolve([]),
      ]);

      const community = communityRows[0];
      const management = community
        && (community.contactName || community.contactEmail || community.contactPhone)
        ? {
          name: community.contactName ?? null,
          email: community.contactEmail ?? null,
          phone: community.contactPhone ?? null,
        }
        : null;

      return {
        management,
        board: boardRows.map((row) => ({
          name: row.fullName,
          title: row.displayTitle ?? (isBoardPresident(row.designation) ? 'Board President' : 'Board Member'),
        })),
      };
    },
  };
}
