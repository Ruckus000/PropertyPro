/**
 * Route contract for `GET /api/v1/documents/drafts/[id]/document-search`.
 *
 * Plan A1 bundle drain #36. Document picker search used by the draft
 * editor's "Insert document link" modal. Reuses the existing
 * access-controlled query path (`getAccessibleDocuments`) so the picker
 * never surfaces documents the caller cannot see.
 *
 * `permission.action` is `'write'` (not `'read'`) — pre-migration code
 * enforces `requirePermission(membership, 'documents', 'write')` because
 * this endpoint is only useful from inside a draft authoring session.
 * Also enforces draft authorship (handler-internal).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const documentsDraftsDocumentSearchGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/documents/drafts/[id]/document-search',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      q: z.string().max(200).optional(),
      limit: z.coerce.number().int().positive().max(50).optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'documents', action: 'write' },
});
