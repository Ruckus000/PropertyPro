/**
 * Route contracts for `/api/v1/leases/contacts` (Leases v3, E11 — residents
 * with no email and no login). Both verbs are refused unless the community has
 * turned on `community_settings.leasesAllowResidentsWithoutEmail`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const leaseContactsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/leases/contacts',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'query' },
});

export const leaseContactsPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/leases/contacts',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        fullName: z.string().trim().min(1).max(200),
        phone: z.string().trim().max(40).nullable().optional(),
        mailingAddress: z.string().trim().max(500).nullable().optional(),
        noticeDelivery: z.enum(['mail', 'hand']).optional(),
      })
      .strict(),
  },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});
