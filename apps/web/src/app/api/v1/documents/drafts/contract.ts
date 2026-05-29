/**
 * Route contracts for `GET` and `POST /api/v1/documents/drafts`.
 *
 * Plan A1 drain #142. Document drafts collection (list + create with optional
 * meeting / re-edit seed paths).
 *
 * GET uses `resolveEffectiveCommunityId(req, query.communityId)` after auth.
 * POST uses the same tenant resolution on `body.communityId`.
 *
 * Response: loose `z.unknown()` — draft rows and created records may carry
 * `Date` fields.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createDraftBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500).optional(),
  targetCategoryId: z.number().int().positive().nullable().optional(),
  targetMeetingId: z.number().int().positive().nullable().optional(),
  sourceDocumentId: z.number().int().positive().nullable().optional(),
  initialBodyHtml: z.string().max(2_000_000).optional(),
});

export const documentDraftsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/documents/drafts',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.array(z.unknown()),
  permission: { resource: 'documents', action: 'write' },
});

export const documentDraftsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/documents/drafts',
  request: {
    body: createDraftBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'documents', action: 'write' },
});
