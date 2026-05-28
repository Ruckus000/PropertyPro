import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.string().min(1),
});

const communityQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

const createElectionProxyBodySchema = z.object({
  communityId: z.number().int().positive(),
  proxyHolderUserId: z.string().uuid(),
  grantorUnitId: z.number().int().positive().nullable().optional(),
});

export const electionsProxiesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/elections/[id]/proxies',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'read' },
});

export const electionsProxiesCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/proxies',
  request: {
    params: paramsSchema,
    body: createElectionProxyBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'write' },
});
