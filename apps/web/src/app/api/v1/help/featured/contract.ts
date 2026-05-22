/**
 * Route contract for `GET /api/v1/help/featured` (Plan A1).
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / `withErrorHandler` / service code into the
 * client bundle. The handler in `./route.ts` is the only value-consumer.
 *
 * Response shape: `HelpArticleSummary[]` — an array of summarised article
 * objects (title, description, category, slug). Non-paginated.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Per-item schema for a featured article summary.
 * Mirrors the projection in `./route.ts`: only the four display fields are
 * included (title, description, category, slug). The full `HelpArticleMetadata`
 * is intentionally NOT exposed — the consumer only renders article cards.
 */
export const helpArticleSummarySchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  slug: z.string(),
});

export type HelpArticleSummary = z.infer<typeof helpArticleSummarySchema>;

export const helpFeaturedContract = defineRoute({
  method: 'GET',
  path: '/api/v1/help/featured',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.array(helpArticleSummarySchema),
  paginated: false,
  permission: { resource: 'help', action: 'read' },
});
