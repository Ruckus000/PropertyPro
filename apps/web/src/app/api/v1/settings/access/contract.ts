/**
 * Route contracts for `GET` / `PATCH /api/v1/settings/access`.
 *
 * Whether condo/HOA tenants can open the Inspection Reports category (incl.
 * SIRS). Stored in `communities.community_settings.tenantsCanViewInspectionReports`
 * via the atomic merge in community-settings-service; absent = off.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const accessSettingsResponseSchema = z.object({
  tenantsCanViewInspectionReports: z.boolean(),
});

export const getAccessSettingsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/settings/access',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: accessSettingsResponseSchema,
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'query' },
});

export const patchAccessSettingsContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/settings/access',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      tenantsCanViewInspectionReports: z.boolean(),
    }),
  },
  response: accessSettingsResponseSchema,
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'body' },
});
