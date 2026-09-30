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
import { isCalendarDate } from '@/lib/finance/date-only';

// A real calendar date: the regex alone let '2026-02-31' reach the INSERT (500).
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => isCalendarDate(value), 'must be a valid calendar date');

const createAssessmentBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  amountCents: z.number().int().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'one_time']),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  lateFeeAmountCents: z.number().int().min(0).optional(),
  lateFeeDaysGrace: z.number().int().min(0).optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (body) => !body.startDate || !body.endDate || body.endDate >= body.startDate,
  { message: 'endDate must be on or after startDate', path: ['endDate'] },
);

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
