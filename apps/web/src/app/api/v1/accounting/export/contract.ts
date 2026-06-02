/**
 * Route contract for `POST /api/v1/accounting/export`.
 *
 * Plan A1 drain #170. Exports community ledger entries to QuickBooks/Xero.
 *
 * Body: `{ communityId, provider, startDate?, endDate?, limit? }`.
 *
 * Response: loose `z.unknown()`. `exportLedgerToAccounting` returns a
 * service-shaped export summary; tight modeling would risk `safeParse`-fail
 * before serialization. Wire shape stays byte-identical at `{ data: <result> }`.
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
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const accountingExportContract = defineRoute({
  method: 'POST',
  path: '/api/v1/accounting/export',
  request: { body: bodySchema },
  response: z.unknown(),
  permission: { resource: 'accounting', action: 'write' },
});
