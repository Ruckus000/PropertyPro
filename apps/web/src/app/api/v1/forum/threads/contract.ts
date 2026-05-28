import { defineRoute, z } from '@propertypro/api-contract';

const listThreadsQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const forumThreadsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/forum/threads',
  request: {
    query: listThreadsQuerySchema,
    body: z.unknown().optional(),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'polls', action: 'read' },
});

export const forumThreadsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/forum/threads',
  request: {
    body: z.unknown().optional(),
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'write' },
});
