import { defineRoute, z } from '@propertypro/api-contract';

export const delinquencyGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/delinquency',
  request: {},
  response: z.unknown(),
  permission: { resource: 'finances', action: 'read' },
});
