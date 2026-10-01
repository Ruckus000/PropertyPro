/**
 * Route contract for `POST /api/v1/invitations/batch` — send (or resend)
 * invitations to several members in ONE request.
 *
 * Exists because the write rate limit is 30 requests/min/user: a client loop
 * over POST /api/v1/invitations fails from the 31st invite. Each user goes
 * through the same sendCommunityInvitation as the single route.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const BATCH_INVITE_MAX = 100;

export const batchInvitationResultSchema = z.object({
  userId: z.string(),
  status: z.enum(['sent', 'failed']),
  error: z.string().optional(),
});

export const batchInvitationContract = defineRoute({
  method: 'POST',
  path: '/api/v1/invitations/batch',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      userIds: z.array(z.string().min(1)).min(1).max(BATCH_INVITE_MAX),
      ttlDays: z.number().int().min(0).max(30).optional(),
    }),
  },
  response: z.object({ results: z.array(batchInvitationResultSchema) }),
  permission: { resource: 'residents', action: 'write' },
  tenantScope: { in: 'body' },
});
