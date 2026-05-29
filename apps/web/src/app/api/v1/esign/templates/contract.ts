/**
 * Route contracts for `GET` and `POST /api/v1/esign/templates`.
 *
 * Plan A1 drain #124. List + create e-sign templates.
 *
 * GET auth surface:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireEsignReadPermission (async)
 *     → manual `status` / `type` enum parse in handler (NOT in Zod — invalid
 *       values must throw `ValidationError` with #232 field message shape)
 *
 * POST auth surface:
 *   body validated by contract
 *     → parseCommunityIdFromBody
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireEsignWritePermission (async)
 *     → requirePlanFeature(communityId, 'hasEsign')
 *
 * Response: loose `z.unknown()` — template rows may carry `Date` fields.
 *
 * `permission` metadata is illustrative; effective gates are esign helpers.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createTemplateBodySchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  templateType: z.enum([
    'proxy',
    'consent',
    'lease_addendum',
    'maintenance_auth',
    'violation_ack',
    'assessment_agreement',
    'custom',
  ]),
  sourceDocumentPath: z.string().trim().min(1),
  fieldsSchema: z.object({
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
  }),
});

export const esignTemplatesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/templates',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'read' },
});

export const esignTemplatesCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/templates',
  request: {
    body: createTemplateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'write' },
});
