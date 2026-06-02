/**
 * Route contracts for `/api/v1/move-checklists` (collection).
 *
 * Plan A1 drain #107. Admin-only list + create. Sibling `[id]` drained in #19.
 *
 * GET auth-first: contract query omits `communityId` so invalid/missing
 * `communityId` does not 400 before `requireAuthenticatedUserId` (forum/threads
 * #97 precedent). Filters parsed in-handler after membership + admin gate.
 *
 * POST: body validated by runner before handler auth (standard runRoute order).
 *
 * Response: loose `z.unknown()` — `MoveChecklist` rows carry `Date` fields.
 *
 * `permission: { resource: 'move_checklists', action: 'read' | 'write' }` —
 * metadata only; effective gate is inline `isAdminRole`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const listMoveChecklistsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/move-checklists',
  request: {},
  response: z.unknown(),
  permission: { resource: 'move_checklists', action: 'read' },
});

export const createMoveChecklistContract = defineRoute({
  method: 'POST',
  path: '/api/v1/move-checklists',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      leaseId: z.number().int().positive(),
      unitId: z.number().int().positive(),
      residentId: z.string().uuid(),
      type: z.enum(['move_in', 'move_out']),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'move_checklists', action: 'write' },
});
