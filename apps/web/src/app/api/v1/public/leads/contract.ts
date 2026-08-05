/**
 * Route contract for `POST /api/v1/public/leads`.
 *
 * Unauthenticated marketing lead capture — fed by the §718 compliance checker on
 * the public marketing site. No session auth; rate-limited by client IP in the
 * handler before validation runs, so malformed bodies cannot bypass the throttle.
 *
 * No `tenantScope`: a lead has no community. See
 * `packages/db/src/schema/marketing-leads.ts`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const publicLeadsPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/public/leads',
  request: {
    body: z.object({
      email: z.string().trim().email().max(254),
      associationName: z.string().trim().max(200).optional(),
      contactName: z.string().trim().max(200).optional(),
      associationType: z.enum(['condo', 'hoa']).optional(),
      unitCount: z.number().int().positive().max(100_000).optional(),
      obligationRequired: z.boolean().optional(),
    }),
  },
  response: z.object({ ok: z.boolean() }),
  permission: { resource: 'communities', action: 'read' },
});
