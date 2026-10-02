/**
 * Route contracts for `GET` / `PATCH /api/v1/payments/past-due-rule`.
 *
 * The community's definition of "past due" for the Directory: overdue amount
 * over `minCents` AND oldest unpaid charge more than `minDays` late. Stored in
 * `communities.community_settings` (pastDueMinCents / pastDueMinDays) via the
 * atomic merge in community-settings-service. Same gates as fee-policy.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const ruleSchema = z.object({
  // $1,000,000 and ten years are far past any real rule; they bound typos.
  minCents: z.number().int().min(0).max(100_000_000),
  minDays: z.number().int().min(0).max(3650),
});

export const pastDueRuleResponseSchema = ruleSchema;

export const getPastDueRuleContract = defineRoute({
  method: 'GET',
  path: '/api/v1/payments/past-due-rule',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: pastDueRuleResponseSchema,
  permission: { resource: 'finances', action: 'read' },
  tenantScope: { in: 'query' },
});

export const patchPastDueRuleContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/payments/past-due-rule',
  request: {
    body: ruleSchema.extend({
      communityId: z.number().int().positive(),
    }),
  },
  response: pastDueRuleResponseSchema,
  permission: { resource: 'finances', action: 'write' },
  tenantScope: { in: 'body' },
});
