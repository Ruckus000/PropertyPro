/**
 * Route contract for `POST /api/v1/import-units` — bulk-create units from a
 * CSV, previewed first (`dryRun`). Mirrors `/api/v1/import-residents`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const rowErrorSchema = z.object({
  rowNumber: z.number().int(),
  column: z.string().nullable(),
  message: z.string(),
});

export const importUnitsContract = defineRoute({
  method: 'POST',
  path: '/api/v1/import-units',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      csv: z.string().min(1, 'CSV text is required'),
      dryRun: z.boolean().optional().default(false),
    }),
  },
  response: z.object({
    /** Rows that would be (dryRun) or were created. */
    units: z.array(
      z.object({
        rowNumber: z.number().int(),
        unitNumber: z.string(),
        building: z.string().nullable(),
        floor: z.number().int().nullable(),
        bedrooms: z.number().int().nullable(),
        bathrooms: z.number().int().nullable(),
        sqft: z.number().int().nullable(),
        occupancy: z.string().nullable(),
      }),
    ),
    errors: z.array(rowErrorSchema),
    importedCount: z.number().int(),
    skippedCount: z.number().int(),
    dryRun: z.boolean(),
  }),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});

export type ImportUnitsResponse = z.infer<typeof importUnitsContract.response>;
