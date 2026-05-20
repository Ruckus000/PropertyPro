/**
 * Route contract for `GET /api/v1/document-categories` (Plan A1 pilot).
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / `withErrorHandler` / service code into the
 * client bundle. The handler in `./route.ts` is the only value-consumer.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Per-item response schema. Mirrors `DocumentCategoryListItem` in
 * `apps/web/src/lib/services/document-category-service.ts:11-17`.
 */
export const documentCategoryItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
});

export type DocumentCategoryItem = z.infer<typeof documentCategoryItemSchema>;

export const documentCategoriesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/document-categories',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      cursor: z.string().min(1).max(256).optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  },
  response: documentCategoryItemSchema,
  paginated: true,
  permission: { resource: 'documents', action: 'read' },
});
