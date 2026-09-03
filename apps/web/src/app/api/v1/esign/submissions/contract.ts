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

/**
 * The field layout carried by a request that has no template. Identical to the
 * template route's `fieldsSchema`, because it is the same thing — the builder
 * produces one layout and either saves it as a template or sends it once.
 */
const fieldsSchemaShape = z.object({
  version: z.literal(1),
  fields: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['signature', 'initials', 'date', 'text', 'checkbox']),
      signerRole: z.string(),
      page: z.number().int().min(0),
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      width: z.number().gt(0).max(100),
      height: z.number().gt(0).max(100),
      required: z.boolean(),
      label: z.string().optional(),
    }),
  ),
  signerRoles: z.array(z.string().min(1)),
});

const createSubmissionBodySchema = z.object({
  communityId: z.number().int().positive(),
  /** Send from a saved template. Exactly one of this or `document`. */
  templateId: z.number().int().positive().optional(),
  /**
   * Send a document with no template. The PDF is uploaded through the same
   * presigned route a template's is, so the path and the bytes are re-checked
   * server-side in the handler.
   */
  document: z
    .object({
      name: z.string().trim().min(1).max(200),
      sourceDocumentPath: z.string().trim().min(1),
      fieldsSchema: fieldsSchemaShape,
    })
    .optional(),
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
}).refine(
  (body) => (body.templateId === undefined) !== (body.document === undefined),
  {
    message: 'Provide exactly one of templateId or document',
    path: ['templateId'],
  },
);

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
