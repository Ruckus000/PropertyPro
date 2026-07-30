/**
 * Route contracts for `/api/v1/pm/site/blocks`. Plan A1.
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / service code into the client bundle.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const siteBlockSchema = z.object({
  id: z.number(),
  /**
   * Which page the block belongs to (Phase 11b). Nullable because the column is
   * nullable until 11c — a null means a row the pre-11b deploy wrote that no
   * write path has adopted yet, not a block without a page.
   */
  pageId: z.number().nullable(),
  blockType: z.string(),
  blockOrder: z.number(),
  content: z.unknown(),
  isDraft: z.boolean(),
  publishedAt: z.string().nullable(),
});

/**
 * Optional page target on every mutation.
 *
 * OPTIONAL on purpose, and it must stay that way for one release: 11b-1 ships
 * before the editor can send a `pageId`, so the live client's requests have to
 * keep working. The service defaults an absent value to the community's home
 * page. It becomes effectively required once 11c makes the column NOT NULL.
 */
const pageIdField = z.number().int().positive().optional();

export const blocksListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/blocks',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      /**
       * Restrict the listing to one page. Omitted returns EVERY page's blocks,
       * which is what the editor wants: `blocks` and `publishedBlocks` have to
       * resolve in the same tick for the change model, so the client filters by
       * page rather than refetching per page.
       */
      pageId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.object({
    // The MERGED draft-wins editor view, including tombstones.
    blocks: z.array(siteBlockSchema),
    /**
     * The last PUBLISHED state — published rows only, no drafts, no tombstones.
     *
     * Additive in Phase 4, and load-bearing for it: `blocks` alone is the
     * merged view, so a client holding only that literally cannot tell what
     * changed. The change model diffs this against `blocks`, and it has to come
     * from the server because publish-time validation runs against the same
     * pair — a diff the client computed against a published side it invented
     * would be a diff of nothing.
     */
    publishedBlocks: z.array(siteBlockSchema),
    // Authoritative optimistic-concurrency token (max published_at over all
    // published rows). The editor echoes it back on publish. Null before the
    // first publish.
    latestPublishedAt: z.string().nullable(),
  }),
  permission: { resource: 'settings', action: 'read' },
});

export const blocksDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/site/blocks',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      // Content blocks only — order 1 is the hero, which every layout
      // requires and which therefore cannot be deleted.
      blockOrder: z.number().int().min(2).max(99),
      pageId: pageIdField,
    }),
  },
  response: z.object({
    ok: z.literal(true),
    /**
     * true — the section is published; removal was staged as a draft and
     * takes effect on the next publish. false — the section was an
     * unpublished draft and is gone immediately.
     */
    staged: z.boolean(),
  }),
  permission: { resource: 'settings', action: 'write' },
});

export const blocksUpsertContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/blocks',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      // hero has its own dedicated endpoint at /api/v1/pm/site/hero.
      // faq + amenities + gallery are the Pro+ polish blocks (faq/amenities
      // in PR #10c, gallery in #10d); the handler additionally gates all
      // three on hasSitePolishBlocks (POLISH_BLOCK_TYPES).
      blockType: z.enum([
        'text',
        'image',
        'announcements',
        'documents',
        'meetings',
        'contact',
        'faq',
        'gallery',
        'amenities',
        'payments',
      ]),
      blockOrder: z.number().int().min(2).max(99), // 1 is reserved for the hero block
      content: z.unknown(),
      pageId: pageIdField,
    }),
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
