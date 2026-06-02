/**
 * Route contract for `POST /api/v1/move-checklists/[id]/steps/[stepKey]/action`.
 *
 * Plan A1 drain #150. Admin-only integration actions on actionable checklist
 * steps (welcome email, portal invite, inspection request).
 *
 * Pre-migration wire shape returned top-level `{ data, action }` siblings.
 * Handler preserves that inner object; runner wraps to
 * `{ data: { data: <checklist>, action: { triggered, stepKey } } }`.
 * Consumer hook only checks `res.ok` — no hook change required.
 *
 * `permission: { resource: 'move_checklists', action: 'update' }` is metadata
 * only; effective gate is inline `isAdminRole`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  stepKey: z.string().min(1).max(50).regex(/^[a-z_]+$/, 'Invalid step key format'),
});

const bodySchema = z.object({
  communityId: z.number().int().positive(),
  action: z.enum(['create_inspection', 'send_invite', 'send_welcome']),
});

const actionMetaSchema = z.object({
  triggered: z.enum(['create_inspection', 'send_invite', 'send_welcome']),
  stepKey: z.string(),
});

export const moveChecklistStepActionPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/move-checklists/[id]/steps/[stepKey]/action',
  request: {
    params: paramsSchema,
    body: bodySchema,
  },
  response: z.object({
    data: z.unknown(),
    action: actionMetaSchema,
  }),
  permission: { resource: 'move_checklists', action: 'update' },
});
