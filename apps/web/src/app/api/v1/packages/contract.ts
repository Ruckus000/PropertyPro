import { defineRoute, z } from '@propertypro/api-contract';

const packageStatusSchema = z.enum(['received', 'notified', 'picked_up']);

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const listPackagesQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  status: packageStatusSchema.optional(),
  unitId: z.coerce.number().int().positive().optional(),
  // Preserve legacy `|| undefined` semantics from the pre-contract route so
  // `?cursor=` / `?pageSize=` are treated as missing instead of 400.
  cursor: z.preprocess(emptyStringToUndefined, z.string().min(1).max(256).optional()),
  pageSize: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
});

const createPackageBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitNumber: z.string().trim().min(1).max(100),
  recipientName: z.string().trim().min(1).max(240),
  carrier: z.string().trim().min(1).max(120),
  trackingNumber: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const packagesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/packages',
  request: {
    query: listPackagesQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'packages', action: 'read' },
});

export const packagesCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/packages',
  request: {
    body: createPackageBodySchema,
  },
  // Service returns Date-bearing DB rows; keep response loose.
  response: z.unknown(),
  permission: { resource: 'packages', action: 'write' },
});
