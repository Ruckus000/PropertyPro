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
import { announcements, documentCategories, documents, meetings, siteBlocks } from '@propertypro/db';
// AUTHZ: Public-site reader — unauthenticated context, no TenantContext available; every method applies an explicit community_id predicate.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, asc, desc, eq, gte, inArray, isNull, lte } from '@propertypro/db/filters';

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

export interface PublicMeeting {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
}

export interface PublicScopedReader {
  readonly communityId: number;

  /** Returns the community's published, non-deleted site blocks in order. */
  listSiteBlocks(): Promise<PublicSiteBlock[]>;

  /** PR #3 — published, non-expired announcements. */
  listAnnouncements(opts: { limit: number; timeWindowDays?: number | null }): Promise<PublicAnnouncement[]>;

  /**
   * PR #4 — documents filtered by category name.
   *
   * Returns [] when includeCategories is empty/missing — categories are the
   * only public-access control (no public_access column on documents yet).
   */
  listDocuments(opts: { limit: number; includeCategories?: string[] }): Promise<PublicDocument[]>;

  /** PR #4 — upcoming meetings within window. */
  listMeetings(opts: { limit: number; timeWindowDays: number }): Promise<PublicMeeting[]>;

  /** PR #4 — community + board + management contact. Stubbed: returns null. */
  getContactInfo(opts: { showBoard: boolean; showManagement: boolean }): Promise<unknown | null>;
}

export function getPublicCommunityScopedReader(communityId: number): PublicScopedReader {
  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(
      `getPublicCommunityScopedReader: communityId must be a positive integer; got ${communityId}`,
    );
  }

  const db = createUnscopedClient();

  return {
    communityId,

    async listSiteBlocks() {
      const rows = await db
        .select({
          id: siteBlocks.id,
          blockType: siteBlocks.blockType,
          blockOrder: siteBlocks.blockOrder,
          content: siteBlocks.content,
        })
        .from(siteBlocks)
        .where(
          and(
            eq(siteBlocks.communityId, communityId),
            eq(siteBlocks.isDraft, false),
            eq(siteBlocks.templateVariant, 'public'),
            isNull(siteBlocks.deletedAt),
          ),
        )
        .orderBy(asc(siteBlocks.blockOrder));

      return rows.map((r) => ({
        id: r.id,
        blockType: r.blockType,
        blockOrder: r.blockOrder,
        content: r.content,
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
      // PR #4 — categories are the only public-access control on documents
      // (no public_access column on the documents table yet). Return empty
      // when no categories are specified so unpublicised docs stay hidden.
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
            inArray(documentCategories.name, opts.includeCategories),
          ),
        )
        .orderBy(desc(documents.createdAt))
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

    async getContactInfo(_opts) {
      // PR #4 implementation
      return null;
    },
  };
}
