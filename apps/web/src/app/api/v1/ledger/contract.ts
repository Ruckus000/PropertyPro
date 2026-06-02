/**
 * Route contract for `GET /api/v1/ledger`.
 *
 * Plan A1 drain #111. Finance ledger listing with resident unit scoping.
 *
 * Contract query carries only `communityId`; `unitId`, `startDate`, `endDate`,
 * `entryType`, and `limit` are parsed manually in-handler to preserve
 * `parsePositiveInt` / `parseDateOnly` messages and `ALLOWED_ENTRY_TYPES` guard.
 *
 * Auth chain (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery
 *     → requireCommunityMembership
 *     → requireFinanceEnabled (async)
 *     → [resident owner unit scoping | requireFinanceReadPermission]
 *     → listLedgerForCommunity
 *
 * Response: `z.array(z.unknown())` — ledger rows may include Date fields.
 *
 * `permission: { resource: 'finances', action: 'read' }` — metadata only;
 * runtime gate uses `requireFinanceReadPermission`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const ledgerListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/ledger',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.array(z.unknown()),
  permission: { resource: 'finances', action: 'read' },
});
