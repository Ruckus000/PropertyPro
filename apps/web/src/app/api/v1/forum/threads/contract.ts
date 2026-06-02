import { defineRoute, z } from '@propertypro/api-contract';

const listThreadsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createThreadBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(8000),
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
    body: createThreadBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'write' },
});
