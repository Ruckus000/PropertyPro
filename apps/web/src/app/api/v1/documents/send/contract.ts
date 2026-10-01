/**
 * Route contract for `POST /api/v1/documents/send` — the Directory's "Send
 * documents": email specific documents to specific members as a courtesy copy.
 *
 * `sendId` is the idempotency key: the client mints one per dialog and reuses
 * it on retry, so a retried request does not email anyone twice.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const SEND_DOCUMENTS_MAX_RECIPIENTS = 100;
export const SEND_DOCUMENTS_MAX_DOCUMENTS = 10;

export const documentSendResultSchema = z.object({
  userId: z.string(),
  status: z.enum(['emailed', 'digest', 'opted_out', 'no_access', 'not_member', 'failed']),
  documentIds: z.array(z.number().int()),
});

export const documentsSendContract = defineRoute({
  method: 'POST',
  path: '/api/v1/documents/send',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      documentIds: z.array(z.number().int().positive()).min(1).max(SEND_DOCUMENTS_MAX_DOCUMENTS),
      userIds: z.array(z.string().min(1)).min(1).max(SEND_DOCUMENTS_MAX_RECIPIENTS),
      sendId: z.string().uuid(),
    }),
  },
  response: z.object({ results: z.array(documentSendResultSchema) }),
  permission: { resource: 'documents', action: 'write' },
  tenantScope: { in: 'body' },
});
