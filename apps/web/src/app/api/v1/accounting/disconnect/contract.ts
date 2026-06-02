/**
 * Route contract for `DELETE /api/v1/accounting/disconnect`.
 *
 * Plan A1 drain #84. Second `DELETE` handler in the contract corpus
 * (after drain #22 `esign/consent`). Unlike drain #22, this one carries
 * a body (not just a query), so `runRoute`'s body-parsing path is
 * exercised for a DELETE method — `defineRoute`'s `HttpMethod` includes
 * `'DELETE'`, and the runner is method-agnostic: `parseBody` is invoked
 * for any non-GET method when a body schema is declared.
 *
 * Body: `{ communityId, provider }`. `provider` is the discriminator the
 * service uses to revoke the right OAuth credential row.
 *
 * Response: loose `z.unknown()`. `disconnectAccounting` returns a
 * service-shaped record (including `Date` fields in some branches);
 * tight modeling would `safeParse`-fail before serialization. Wire shape
 * stays byte-identical at `{ data: <service-result> }`.
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

export const accountingDisconnectContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/accounting/disconnect',
  request: { body: bodySchema },
  response: z.unknown(),
  permission: { resource: 'accounting', action: 'write' },
});
