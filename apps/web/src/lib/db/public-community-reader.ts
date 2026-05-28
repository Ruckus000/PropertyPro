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
 */
import { announcements, siteBlocks } from '@propertypro/db';
// AUTHZ: Public-site reader — unauthenticated context, no TenantContext available; every method applies an explicit community_id predicate.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, asc, desc, eq, gte, isNull, lte } from '@propertypro/db/filters';

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

export interface PublicScopedReader {
  readonly communityId: number;

  /** Returns the community's published, non-deleted site blocks in order. */
  listSiteBlocks(): Promise<PublicSiteBlock[]>;

  /** PR #3 — published, non-expired announcements. */
  listAnnouncements(opts: { limit: number; timeWindowDays?: number | null }): Promise<PublicAnnouncement[]>;

  /** PR #4 — public-access documents. Stubbed: returns []. */
  listDocuments(opts: { limit: number; includeCategories?: string[] }): Promise<unknown[]>;

  /** PR #4 — upcoming meetings within window. Stubbed: returns []. */
  listMeetings(opts: { limit: number; timeWindowDays: number }): Promise<unknown[]>;

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

    async listDocuments(_opts) {
      // PR #4 implementation
      return [];
    },

    async listMeetings(_opts) {
      // PR #4 implementation
      return [];
    },

    async getContactInfo(_opts) {
      // PR #4 implementation
      return null;
    },
  };
}
