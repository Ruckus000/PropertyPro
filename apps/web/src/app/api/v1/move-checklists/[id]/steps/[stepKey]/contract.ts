/**
 * Route contract for `PATCH /api/v1/move-checklists/[id]/steps/[stepKey]`.
 *
 * Plan A1 drain #126. Admin-only step update on a move checklist.
 *
 * Auth surface (preserved verbatim from pre-migration):
 *   requireAuthenticatedUserId
 *     → params validated by runner (`id`, `stepKey`)
 *     → body validated by contract
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → isAdminRole → ForbiddenError (was inline 403 `{ error: 'Forbidden' }`)
 *
 * Response: loose `z.unknown()` — checklist rows carry `Date` fields.
 *
 * `permission: { resource: 'move_checklists', action: 'update' }` is metadata
 * only; effective gate is inline `isAdminRole`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  stepKey: z.string().min(1).max(50).regex(/^[a-z_]+$/, 'Invalid step key format'),
});

export const updateMoveChecklistStepContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/move-checklists/[id]/steps/[stepKey]',
  request: {
    params: paramsSchema,
    body: z.object({
      communityId: z.number().int().positive(),
      completed: z.boolean(),
      notes: z.string().max(2000).optional(),
      linkedEntityType: z.enum(['esign_submission', 'maintenance_request', 'invitation']).optional(),
      linkedEntityId: z.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'move_checklists', action: 'update' },
});
