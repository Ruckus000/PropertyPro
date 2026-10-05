/**
 * Route contracts for `/api/v1/leases/settings` (Leases v3): the expiry alert
 * windows and the residents-without-email switch, both stored in
 * `communities.community_settings`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const leaseSettingsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/leases/settings',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.object({
    alertWindows: z.array(z.number()),
    allowResidentsWithoutEmail: z.boolean(),
  }),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'query' },
});

export const leaseSettingsPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/leases/settings',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        /** 1–4 distinct windows, 1–365 days. Stored ascending. */
        alertWindows: z.array(z.number().int().min(1).max(365)).min(1).max(4).optional(),
        allowResidentsWithoutEmail: z.boolean().optional(),
      })
      .strict(),
  },
  response: z.object({
    alertWindows: z.array(z.number()),
    allowResidentsWithoutEmail: z.boolean(),
  }),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});
