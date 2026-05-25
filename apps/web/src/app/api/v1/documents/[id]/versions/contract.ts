/**
 * Route contract for `GET /api/v1/documents/[id]/versions`.
 *
 * Plan A1 bundle drain #38. Returns the document version chain — every
 * document linked to the reference doc via `documents.parent_document_id`,
 * in either direction. Loose `z.unknown()` response — the payload is an
 * array of version-record objects with ISO-string timestamps; the
 * handler-internal sorting is non-trivial and the wire shape is pinned
 * via consumer-side TypeScript.
 *
 * No `permission` block — the pre-migration handler only enforces
 * authentication + community membership; the per-document access check
 * is done inline via `getDocumentWithAccessCheck` + RLS in
 * `getAccessibleDocuments`. There is no `documents.read` /
 * `documents.write` runtime gate here.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const documentsVersionsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/documents/[id]/versions',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
});
