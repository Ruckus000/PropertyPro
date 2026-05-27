/**
 * Route contracts for `GET /api/v1/accounting/mapping` and
 * `PUT /api/v1/accounting/mapping`.
 *
 * Plan A1 drain #88. Two contracts in one file (GET+PUT) — same plumbing as
 * drain #22 (GET+DELETE) and drains #4/#13/#16 (GET+PATCH). The runner
 * dispatches by exported handler name; per-method auth gates differ (read
 * for GET, write for PUT).
 *
 * Behavior-preserving notes:
 *   - The pre-migration handler called `parseCommunityIdFromQuery(req)`
 *     (GET) and `parseCommunityIdFromBody(req, body.communityId)` (PUT).
 *     Both helpers already delegate to `resolveEffectiveCommunityId(...)`
 *     under the hood (drain #10 lesson). The migrated handler expresses
 *     `communityId` via Zod query/body validation plus an explicit
 *     `resolveEffectiveCommunityId(req, ...)` call, preserving the
 *     header-vs-query/body precedence semantics.
 *   - Pre-migration error literals (`'Invalid mapping query parameters'`,
 *     `'Invalid accounting mapping payload'`) are not preserved verbatim —
 *     the runner emits the canonical `VALIDATION_ERROR` envelope. No UI
 *     consumer reads these literals (no hook in the repo), so this is safe.
 *
 * Response modeling: loose `z.unknown()` for both contracts.
 *   - `getAccountingMapping` returns `discoveredAccounts:
 *     AccountingMappingOption[]` whose entry shape (adapter-provided) would
 *     `safeParse`-fail without an exact schema; the runner's response
 *     check runs before `NextResponse.json` serializes (drain #14/#18/#20
 *     precedent).
 *   - `updateAccountingMapping` returns the simpler `{provider, mapping}`
 *     shape, but kept loose for consistency with the GET sibling.
 *
 * Permission: `{ resource: 'accounting', action: <'read'|'write'> }`.
 * `accounting` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:50`),
 * so this is a non-placeholder pair. The action verbs match the runtime
 * gates enforced by `requireAccountingReadPermission` /
 * `requireAccountingWritePermission`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const PROVIDER = z.enum(['quickbooks', 'xero']);

export const accountingMappingGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/accounting/mapping',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      provider: PROVIDER,
    }),
  },
  response: z.unknown(),
  permission: { resource: 'accounting', action: 'read' },
});

export const accountingMappingPutContract = defineRoute({
  method: 'PUT',
  path: '/api/v1/accounting/mapping',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      provider: PROVIDER,
      mapping: z.record(z.string(), z.string()),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'accounting', action: 'write' },
});
