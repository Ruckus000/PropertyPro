/**
 * Route contract for `GET /api/v1/help/article` (Plan A1).
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / `withErrorHandler` / service code into the
 * client bundle. The handler in `./route.ts` is the only value-consumer.
 *
 * Response shape: `{ html, toc, metadata, related }` — a single server-rendered
 * article object. Non-paginated (single resource endpoint).
 *
 * 404 semantics: missing, role-gated, and feature-gated articles throw
 * `NotFoundError` (caught by `withErrorHandler` → 404). This avoids leaking
 * the existence of restricted content.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Schema for a single table-of-contents entry.
 */
const tocItemSchema = z.object({
  depth: z.union([z.literal(2), z.literal(3)]),
  label: z.string(),
  anchor: z.string(),
});

/**
 * Schema for `HelpArticleMetadata`. Mirrors
 * `apps/web/src/lib/services/help-article-service.ts:60-78`.
 */
const helpArticleMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  slug: z.string(),
  roles: z.array(z.string()),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  relatedArticles: z.array(z.string()),
  featured: z.boolean(),
  excerpt: z.string().optional(),
  filePath: z.string(),
  contextPaths: z.array(z.string()).optional(),
  statutes: z.array(z.string()).optional(),
  featureGates: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
  readTimeMinutes: z.number().optional(),
  contentHash: z.string(),
});

/**
 * Full article response payload schema.
 */
export const helpArticleResponseSchema = z.object({
  html: z.string(),
  toc: z.array(tocItemSchema),
  metadata: helpArticleMetadataSchema,
  related: z.array(helpArticleMetadataSchema),
});

export const helpArticleContract = defineRoute({
  method: 'GET',
  path: '/api/v1/help/article',
  request: {
    query: z.object({
      category: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .min(1)
        .max(64),
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .min(1)
        .max(128),
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: helpArticleResponseSchema,
  paginated: false,
  permission: { resource: 'help', action: 'read' },
});
