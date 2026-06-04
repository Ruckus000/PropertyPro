/**
 * Route contract for `/api/v1/pm/site/domain/verify` — POST.
 *
 * Re-checks the custom-domain status at the provider and, on first success,
 * flips the persisted status to `active` and stamps `verifiedAt`.
 *
 * Auth surface mirrors the parent domain route's `gate()`.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { domainStateSchema } from '../contract';

export const domainVerifyContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/domain/verify',
  request: { body: z.object({ communityId: z.number().int().positive() }) },
  response: domainStateSchema,
  permission: { resource: 'settings', action: 'write' },
});
