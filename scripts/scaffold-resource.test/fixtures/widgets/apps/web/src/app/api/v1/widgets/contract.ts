/**
 * Route contract for `GET /api/v1/widgets`.
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * Lives in its own file so the hook layer (`useWidgets`) can `import type`
 * from here without dragging Next.js or service code into the client bundle.
 * The handler in `./route.ts` is the only value-consumer.
 *
 * Permission metadata references the project's RBAC matrix
 * (`packages/shared/src/rbac-matrix.ts`). NOTE: this scaffold uses `documents`
 * as a placeholder resource so the contract type-checks against the existing
 * `RBAC_RESOURCES` tuple. Replace with your real resource AFTER you add
 * `widgets` (or whatever your resource is called) to
 * `packages/shared/src/rbac-matrix.ts` — see `docs/contributing/new-resource.md`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Per-item response schema. Mirrors `WidgetListItem` in the service module.
 */
export const widgetItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
});

export type WidgetItem = z.infer<typeof widgetItemSchema>;

export const widgetsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/widgets',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      cursor: z.string().min(1).max(256).optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  },
  response: widgetItemSchema,
  paginated: true,
  permission: { resource: 'documents', action: 'read' },
  // Plan B2: the runner resolves + injects `communityId` from the query.
  // Because this is a query/body scope, the route imports `runRoute` from
  // the app-bound `@/lib/api/run-route` (see ./route.ts).
  tenantScope: { in: 'query' },
});
