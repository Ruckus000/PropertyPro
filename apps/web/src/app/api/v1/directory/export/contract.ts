/**
 * Route contract for `GET /api/v1/directory/export` — the Directory CSV.
 * Returned as JSON (`{ filename, csv }`) like every contract route; the client
 * saves it as a file. Building it here is what lets columns be gated and the
 * export audited.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const DIRECTORY_EXPORT_MAX_SELECTED = 2000;

export const directoryExportContract = defineRoute({
  method: 'GET',
  path: '/api/v1/directory/export',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      kind: z.enum(['units', 'residents']),
      /** Residents only: comma-separated user ids (the current selection). */
      userIds: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(',').map((id) => id.trim()).filter(Boolean) : undefined))
        .pipe(z.array(z.string().uuid()).max(DIRECTORY_EXPORT_MAX_SELECTED).optional()),
      /** Residents only: comma-separated household-member ids in the selection. */
      occupantIds: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(',').map((id) => Number(id.trim())) : undefined))
        .pipe(z.array(z.number().int().positive()).max(DIRECTORY_EXPORT_MAX_SELECTED).optional()),
    }),
  },
  response: z.object({
    filename: z.string(),
    csv: z.string(),
    rowCount: z.number().int().nonnegative(),
  }),
  permission: { resource: 'units', action: 'read' },
  tenantScope: { in: 'query' },
});

export type DirectoryExportResponse = z.infer<typeof directoryExportContract.response>;
