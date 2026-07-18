/**
 * Route contracts for the insurance summary + certificate relay (spec #3).
 *
 * tenantScope declared → routes import runRoute from `@/lib/api/run-route`.
 * `insurance` IS in RBAC_RESOURCES (read: owners/admin, tenants excluded per
 * the 2026-07-17 legal review; write: admin-tier). Certificate requests are
 * owner-callable, so they gate on insurance:read + rate-limiting.
 *
 * response is loose (z.unknown()) — rows carry Date fields that would
 * safeParse-fail a tight schema before NextResponse.json serializes them.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const insurancePolicyTypeValues = [
  'property',
  'wind',
  'flood',
  'liability',
  'umbrella',
  'other',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

export const insurancePolicyCreateBody = z.object({
  communityId: z.number().int().positive(),
  policyType: z.enum(insurancePolicyTypeValues),
  carrierName: z.string().min(1).max(300),
  policyNumber: z.string().max(120).nullable().optional(),
  coverageSummary: z.string().max(4000).nullable().optional(),
  deductibleSummary: z.string().max(4000).nullable().optional(),
  effectiveAt: isoDate.nullable().optional(),
  expiresAt: isoDate,
  agentName: z.string().max(200).nullable().optional(),
  agentEmail: z.string().email().max(320).nullable().optional(),
  agentPhone: z.string().max(60).nullable().optional(),
  documentId: z.number().int().positive().nullable().optional(),
});

export const insurancePolicyUpdateBody = insurancePolicyCreateBody.partial().extend({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
});

export const insurancePoliciesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/insurance/policies',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.unknown(),
  permission: { resource: 'insurance', action: 'read' },
  tenantScope: { in: 'query' },
});

export const insurancePoliciesCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/insurance/policies',
  request: { body: insurancePolicyCreateBody },
  response: z.unknown(),
  permission: { resource: 'insurance', action: 'write' },
  tenantScope: { in: 'body' },
});

export const insurancePoliciesUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/insurance/policies',
  request: { body: insurancePolicyUpdateBody },
  response: z.unknown(),
  permission: { resource: 'insurance', action: 'write' },
  tenantScope: { in: 'body' },
});

export const insurancePoliciesDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/insurance/policies',
  request: { query: z.object({ id: z.coerce.number().int().positive(), communityId: z.coerce.number().int().positive() }) },
  response: z.object({ deleted: z.literal(true), id: z.number() }),
  permission: { resource: 'insurance', action: 'write' },
  tenantScope: { in: 'query' },
});

export const certificateRequestsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/insurance/certificate-requests',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.unknown(),
  permission: { resource: 'insurance', action: 'read' },
  tenantScope: { in: 'query' },
});

export const certificateRequestsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/insurance/certificate-requests',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      policyId: z.number().int().positive(),
      unitLabel: z.string().min(1).max(120),
      recipientName: z.string().min(1).max(300),
      recipientEmail: z.string().email().max(320),
      loanNumber: z.string().max(120).nullable().optional(),
    }),
  },
  response: z.unknown(),
  // Owner-callable: read permission (owners have it, tenants don't) + rate limit.
  permission: { resource: 'insurance', action: 'read' },
  tenantScope: { in: 'body' },
});
