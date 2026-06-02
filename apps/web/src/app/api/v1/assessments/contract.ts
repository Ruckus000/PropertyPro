/**
 * Route contracts for `GET` and `POST /api/v1/assessments`.
 *
 * Plan A1 drain #128. Paginated assessment list + create assessment.
 *
 * GET uses `parseCommunityIdFromQuery` in-handler (finance collection pattern).
 * `cursor` / `pageSize` parsed manually to preserve empty-string collapse.
 *
 * POST uses `parseCommunityIdFromBody` (matches create-intent #125).
 *
 * Response: loose `z.unknown()` — assessment rows carry `Date` fields.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createAssessmentBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  amountCents: z.number().int().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'one_time']),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  lateFeeAmountCents: z.number().int().min(0).optional(),
  lateFeeDaysGrace: z.number().int().min(0).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const assessmentsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/assessments',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'finances', action: 'read' },
});

export const assessmentsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/assessments',
  request: {
    body: createAssessmentBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'write' },
});
