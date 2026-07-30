/**
 * Route contracts for `/api/v1/pm/site/pages` (website editor v3, Phase 11b).
 *
 * Lives in its own file so the hook layer can `import type` from here without
 * dragging Next.js / service code into the client bundle — same reason as the
 * sibling `blocks/contract.ts`.
 *
 * The slug rules are enforced in the SERVICE, not here. Zod can check the shape
 * but not whether a slug is reserved by an application route or held by a
 * retired redirect, and splitting the rules across two layers would mean two
 * error vocabularies for one concept. The contract validates the envelope; the
 * service is the gate.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const sitePageSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** `''` for the home page, which is pinned at the site root. */
  slug: z.string(),
  inNav: z.boolean(),
  sortOrder: z.number(),
  isHome: z.boolean(),
  /** True while the page has never been published — invisible to the public. */
  isDraft: z.boolean(),
  publishedAt: z.string().nullable(),
  /**
   * Set when a publish will REMOVE this page. The page stays live until then, so
   * the editor renders it as a pending removal with an undo rather than hiding it.
   */
  deleteStagedAt: z.string().nullable(),
});

/**
 * Shape only. Length and character rules are duplicated from the DB CHECK so a
 * bad slug is a readable 400 rather than a constraint violation; RESERVED and
 * already-taken are the service's business.
 */
const slugField = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens only.');

const nameField = z.string().min(1).max(60);

export const pagesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/pages',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({
    // Home first, then nav order. Includes unpublished pages: this is the
    // editor's list, and a page the PM just created has to appear in it.
    pages: z.array(sitePageSchema),
  }),
  permission: { resource: 'settings', action: 'read' },
});

export const pagesCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/pages',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        name: nameField,
        slug: slugField,
        inNav: z.boolean().optional(),
      })
      .strict(),
  },
  response: z.object({ ok: z.literal(true), page: sitePageSchema }),
  permission: { resource: 'settings', action: 'write' },
});

export const pagesUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/pages',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        pageId: z.number().int().positive(),
        name: nameField.optional(),
        /**
         * A slug change is LIVE-IMMEDIATE and always leaves a permanent redirect
         * from the old address. There is no draft layer for page addresses — see
         * the service header for why.
         */
        slug: slugField.optional(),
        inNav: z.boolean().optional(),
      })
      .strict()
      .refine(
        (b) => b.name !== undefined || b.slug !== undefined || b.inNav !== undefined,
        { message: 'Provide at least one of name, slug or inNav.' },
      ),
  },
  response: z.object({
    ok: z.literal(true),
    page: sitePageSchema,
    /** The address a redirect now covers, or null when it did not change. */
    redirectedFrom: z.string().nullable(),
  }),
  permission: { resource: 'settings', action: 'write' },
});

export const pagesDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/site/pages',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        pageId: z.number().int().positive(),
        /**
         * Cancel a staged removal instead of staging one. The publish sheet's
         * undo. Same endpoint because it is the same intent expressed twice.
         */
        unstage: z.boolean().optional(),
      })
      .strict(),
  },
  response: z.object({
    ok: z.literal(true),
    /**
     * Whether a removal is PENDING after this call.
     *
     * true  — the page was published, so the removal is staged and the page stays
     *         live until the next publish.
     * false — either the page had never been published (gone already) or this
     *         call cancelled a staged removal. Which one is determined by the
     *         request the caller sent, not by this field.
     */
    staged: z.boolean(),
  }),
  permission: { resource: 'settings', action: 'write' },
});

export const pagesReorderContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/pages/reorder',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        /**
         * EVERY non-home page id, in nav order. The full list rather than a move
         * instruction: the request is then idempotent and cannot half-apply, and
         * a stale client is rejected outright instead of silently renumbering
         * pages it never knew about.
         */
        orderedPageIds: z.array(z.number().int().positive()).max(200),
      })
      .strict(),
  },
  response: z.object({ ok: z.literal(true), pages: z.array(sitePageSchema) }),
  permission: { resource: 'settings', action: 'write' },
});
