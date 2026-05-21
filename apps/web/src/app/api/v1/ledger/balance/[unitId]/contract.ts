/**
 * Route contract for `GET /api/v1/ledger/balance/[unitId]`.
 *
 * Plan A1 drain (post-pilot drain #3). First drain that exercises the
 * contract runner's `params` parsing path — `unitId` lives in the URL
 * path segment, not the query string. The runner awaits Next.js's
 * `Promise<params>` shape, then validates the unparsed string `unitId`
 * via `z.coerce.number().int().positive()`.
 *
 * Authorization: tenant-scoped + owner-vs-staff branching in the route
 * handler. Owners may only read their OWN unit's balance; staff may read
 * any unit. The `permission: { resource: 'finances', action: 'read' }`
 * is the canonical RBAC matrix coordinate but the contract runner does
 * NOT enforce it today (Plan A1 metadata only — the route still calls
 * `requireFinanceReadPermission(membership)` directly).
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Response shape: ledger balance for a single unit. `balanceDollars` is a
 * presentation-layer convenience (`(balanceCents / 100).toFixed(2)`) so
 * UI code doesn't need to re-derive it.
 */
export const ledgerBalanceResponseSchema = z.object({
  unitId: z.number().int().positive(),
  balanceCents: z.number().int(),
  balanceDollars: z.string(),
});

export type LedgerBalanceResponse = z.infer<typeof ledgerBalanceResponseSchema>;

export const ledgerBalanceContract = defineRoute({
  method: 'GET',
  path: '/api/v1/ledger/balance/[unitId]',
  request: {
    params: z.object({
      unitId: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: ledgerBalanceResponseSchema,
  permission: { resource: 'finances', action: 'read' },
});
