/**
 * Route contracts for `GET` and `POST /api/v1/esign/submissions`.
 *
 * Plan A1 drain #116. List + create e-sign submissions.
 *
 * GET auth surface:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery (contract `communityId` only)
 *     → requireCommunityMembership
 *     → requireEsignReadPermission (async)
 *     → manual `status` enum parse in handler (NOT in Zod — invalid values
 *       must throw `ValidationError('Invalid status filter')` with #232 field
 *       message shape, not contract 400)
 *
 * POST auth surface:
 *   body validated by contract
 *     → parseCommunityIdFromBody
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireEsignWritePermission (async)
 *     → requirePlanFeature(communityId, 'hasEsign')
 *
 * Response: loose `z.unknown()` — submission rows may carry `Date` fields.
 *
 * `permission` metadata is illustrative; effective gates are esign helpers.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createSubmissionBodySchema = z.object({
  communityId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  signers: z.array(
    z.object({
      email: z.string().email(),
      name: z.string().trim().min(1).max(200),
      role: z.string().trim().min(1),
      sortOrder: z.number().int().min(0),
      userId: z.string().uuid().optional(),
      prefilledFields: z.record(z.string(), z.unknown()).optional(),
    }),
  ).min(1).max(50),
  signingOrder: z.enum(['parallel', 'sequential']),
  sendEmail: z.boolean(),
  expiresAt: z.string().datetime().optional(),
  messageSubject: z.string().trim().max(200).optional(),
  messageBody: z.string().trim().max(4000).optional(),
  linkedDocumentId: z.number().int().positive().optional(),
});

export const esignSubmissionsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/submissions',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'read' },
});

export const esignSubmissionsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/submissions',
  request: {
    body: createSubmissionBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'write' },
});
