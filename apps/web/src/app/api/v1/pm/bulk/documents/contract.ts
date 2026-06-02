/**
 * Route contract for `POST /api/v1/pm/bulk/documents`.
 *
 * Plan A1 drain #169. PM cross-community bulk document record creation.
 *
 * Authorization: session-anchored PM gate (`isPmAdminInAnyCommunity`) runs
 * inside the handler; contract permission metadata is placeholder only.
 *
 * Response `{ results: DocumentResult[] }` is single-wrapped by the runner as
 * `{ data: { results } }` — already canonical after B1 Slice 3; hook unwraps
 * `.data.results` manually.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const documentItemSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  storagePath: z
    .string()
    .min(1, 'Storage path is required')
    .regex(/^[a-zA-Z0-9_\-/.]+$/, 'Storage path contains invalid characters')
    .refine((p) => !p.includes('..'), 'Path traversal not allowed'),
  categoryId: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const pmBulkDocumentsPostBodySchema = z.object({
  communityIds: z
    .array(z.number().int().positive())
    .min(1, 'At least one community is required'),
  documents: z
    .array(documentItemSchema)
    .min(1, 'At least one document is required'),
});

const bulkDocumentResultSchema = z.object({
  communityId: z.number(),
  communityName: z.string(),
  status: z.enum(['created', 'failed']),
  documentsCreated: z.number().optional(),
  error: z.string().optional(),
});

export const pmBulkDocumentsPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/bulk/documents',
  request: {
    body: pmBulkDocumentsPostBodySchema,
  },
  response: z.object({
    results: z.array(bulkDocumentResultSchema),
  }),
  permission: { resource: 'settings', action: 'write' },
});
