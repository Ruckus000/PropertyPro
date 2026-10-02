/**
 * Route contracts for `/api/v1/occupants` — household members with no portal
 * login (Directory). Manager-only: residents:write plus membership.isAdmin.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const occupantSchema = z.object({
  id: z.number().int().positive(),
  unitId: z.number().int().positive(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isOwnerHousehold: z.boolean(),
  updatedAt: z.string(),
});
export type OccupantDto = z.infer<typeof occupantSchema>;

const email = z.string().trim().email().nullable().optional().or(z.literal('').transform(() => null));
const fields = {
  unitId: z.number().int().positive(),
  fullName: z.string().trim().min(1, 'Name is required').max(200),
  email,
  phone: z.string().trim().max(40).nullable().optional(),
  isOwnerHousehold: z.boolean().optional().default(false),
};

export const occupantsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/occupants',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      cursor: z.string().min(1).max(512).optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  },
  response: occupantSchema,
  paginated: true,
  permission: { resource: 'residents', action: 'read' },
  tenantScope: { in: 'query' },
});

export const occupantsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/occupants',
  request: { body: z.object({ communityId: z.number().int().positive(), ...fields }) },
  response: occupantSchema,
  permission: { resource: 'residents', action: 'write' },
  tenantScope: { in: 'body' },
});

export const occupantsUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/occupants',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      id: z.number().int().positive(),
      unitId: fields.unitId.optional(),
      fullName: fields.fullName.optional(),
      email,
      phone: fields.phone,
      isOwnerHousehold: z.boolean().optional(),
      /** Optimistic concurrency: the `updatedAt` last read; a stale value is a 409. */
      expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
    }),
  },
  response: occupantSchema,
  permission: { resource: 'residents', action: 'write' },
  tenantScope: { in: 'body' },
});

export const occupantsDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/occupants',
  request: { body: z.object({ communityId: z.number().int().positive(), id: z.number().int().positive() }) },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'residents', action: 'write' },
  tenantScope: { in: 'body' },
});
