/**
 * Route contracts for `GET`, `PATCH`, `DELETE /api/v1/esign/templates/[id]`.
 *
 * Plan A1 drain #132. Template detail, update, archive.
 *
 * GET: parseCommunityIdFromQuery after auth (finance reconciliation helper).
 * PATCH/DELETE: parseCommunityIdFromBody / parseCommunityIdFromQuery + plan gate.
 *
 * `fieldsSchema` duplicated here (not imported from service) per drain #123.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const communityQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

const fieldsSchemaBody = z.object({
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

const updateTemplateBodySchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  fieldsSchema: fieldsSchemaBody.optional(),
});

export const esignTemplateGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/templates/[id]',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'read' },
});

export const esignTemplatePatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/esign/templates/[id]',
  request: {
    params: paramsSchema,
    body: updateTemplateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'write' },
});

export const esignTemplateDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/esign/templates/[id]',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
  },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'esign', action: 'write' },
});
