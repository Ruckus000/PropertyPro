/**
 * Widgets Service
 *
 * Tenant-scoped reads for the `widgets` table. Scaffolded by
 * `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * The route handler at `apps/web/src/app/api/v1/widgets/route.ts` is the only
 * sanctioned caller: it has already verified the actor's community
 * membership before invoking these helpers.
 */
import { createScopedClient, paginate, widgets } from '@propertypro/db';

export interface WidgetListItem {
  id: number;
  name: string;
  description: string | null;
}

export interface PaginatedWidgets {
  data: WidgetListItem[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

/**
 * Cursor-paginated list of widgets for a community. Uses the canonical
 * `paginate()` helper from `@propertypro/db` (Plan A2 / ADR-003); the
 * `createScopedClient` enforces tenant isolation + soft-delete filtering.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership.
 */
export async function paginateWidgets(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedWidgets> {
  const scoped = createScopedClient(params.communityId);
  const result = await paginate(scoped, widgets, {
    cursor: params.cursor,
    pageSize: params.pageSize,
  });

  const data = result.data.map((row) => ({
    id: row['id'] as number,
    name: row['name'] as string,
    description: (row['description'] as string | null) ?? null,
  }));

  return { data, pagination: result.pagination };
}
