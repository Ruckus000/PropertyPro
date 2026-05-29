/**
 * Route contracts for `/api/v1/documents/drafts/[id]` — GET, PATCH, DELETE.
 *
 * Plan A1 drain #145. Draft detail (load + autosave + soft-delete).
 * Authors access own drafts; admins can access any draft in the community.
 *
 * All methods take `communityId` via query; tenant resolution uses
 * `resolveEffectiveCommunityId(req, query.communityId)` after auth.
 *
 * Response: loose `z.unknown()` on GET/PATCH — draft rows may carry Dates.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const communityQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

const patchBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().max(2_000_000).optional(),
  targetCategoryId: z.number().int().positive().nullable().optional(),
  coverSheetEnabled: z.boolean().optional(),
  letterheadOptions: z
    .object({ header: z.boolean().optional(), footer: z.boolean().optional() })
    .optional(),
});

export const documentDraftGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/documents/drafts/[id]',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
  },
  response: z.unknown(),
  permission: { resource: 'documents', action: 'write' },
});

export const documentDraftPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/documents/drafts/[id]',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
    body: patchBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'documents', action: 'write' },
});

export const documentDraftDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/documents/drafts/[id]',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
  },
  response: z.object({
    id: z.number().int().positive(),
    deleted: z.literal(true),
  }),
  permission: { resource: 'documents', action: 'write' },
});
