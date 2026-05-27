/**
 * Route contract for `POST /api/v1/accounting/connect`.
 *
 * Plan A1 drain #87. Near-mirror of drain #84 (`accounting/disconnect`):
 * same body schema, same auth chain, same permission pair — the only
 * differences are the HTTP method (`POST` here, `DELETE` there) and the
 * service called (`initiateAccountingConnect` vs `disconnectAccounting`).
 * Notably, `initiateAccountingConnect` is a 3-arg service (no requestId
 * threading), so this contract's handler does NOT forward `x-request-id`.
 *
 * Body: `{ communityId, provider }`. `provider` is the discriminator the
 * service uses to start the right OAuth connect flow.
 *
 * Response: loose `z.unknown()`. `initiateAccountingConnect` returns a
 * service-shaped record (provider-specific OAuth payload); tight modeling
 * would risk `safeParse`-fail before serialization. Wire shape stays
 * byte-identical at `{ data: <service-result> }`.
 *
 * Permission: `{ resource: 'accounting', action: 'write' }`. `accounting`
 * IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:50`), so
 * this is a non-placeholder permission pair. `'write'` matches the
 * runtime gate enforced by `requireAccountingWritePermission`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const bodySchema = z.object({
  communityId: z.number().int().positive(),
  provider: z.enum(['quickbooks', 'xero']),
});

export const accountingConnectContract = defineRoute({
  method: 'POST',
  path: '/api/v1/accounting/connect',
  request: { body: bodySchema },
  response: z.unknown(),
  permission: { resource: 'accounting', action: 'write' },
});
