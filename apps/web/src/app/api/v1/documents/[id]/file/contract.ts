/**
 * Route contract for `PUT /api/v1/documents/[id]/file` — replace a document's
 * file, keeping the document.
 *
 * The bytes are already in storage: the client presigns through
 * `POST /api/v1/upload` and PUTs the file there first, exactly as a new upload
 * does. This route then validates what storage holds and repoints the row.
 *
 * `.strict()` so the body cannot grow into a general document edit: title,
 * category and visibility each have their own audited writer.
 *
 * Response: the id plus the new file's measured fields. No Date fields, so a
 * tight schema is safe and acts as the canary the runner provides.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const replaceDocumentFileBodySchema = z
  .object({
    communityId: z.number().int().positive(),
    filePath: z.string().min(1),
    fileName: z.string().min(1).max(255),
    fileSize: z.number().int().positive(),
    /**
     * Redaction attestation (§718.111(12)(c)). Optional in the schema; the
     * handler requires it when the category or the public site calls for one.
     */
    redactionAttested: z.boolean().optional(),
  })
  .strict();

export const documentsReplaceFileContract = defineRoute({
  method: 'PUT',
  path: '/api/v1/documents/[id]/file',
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: replaceDocumentFileBodySchema,
  },
  // The runner resolves the tenant from `body.communityId`, reconciled against
  // the middleware's `x-community-id` header, and injects it.
  tenantScope: { in: 'body' },
  response: z.object({
    id: z.number().int().positive(),
    fileName: z.string(),
    fileSize: z.number().int().positive(),
    mimeType: z.string(),
  }),
  permission: { resource: 'documents', action: 'write' },
});
