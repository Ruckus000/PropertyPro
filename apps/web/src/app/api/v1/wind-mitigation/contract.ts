/**
 * Route contracts for the wind-mitigation locker (Wave 1 insurance hub).
 *
 * MULTI_METHOD file — one `defineRoute` per exported handler in `./route.ts`.
 *
 * Auth surface (identical across methods):
 *   runRoute resolves communityId from `tenantScope`
 *     → requireAuthenticatedUserId
 *     → [assertNotDemoGrace — mutations only, async, before membership]
 *     → requireCommunityMembership
 *     → requireInsuranceHubCommunity (feature gate — hasInsuranceHub)
 *     → requirePermission('insurance', 'read' | 'write')
 *     → createScopedClient → wind-mitigation-service
 *     → logAuditEvent (mutations)
 *
 * `tenantScope` is declared on every route, so `./route.ts` MUST import
 * `runRoute` from `@/lib/api/run-route` (the app-bound runner that injects
 * `resolveEffectiveCommunityId`). `guard:tenant-scope` enforces this.
 *
 * Response is intentionally `z.unknown()` (loose), matching the `contracts`
 * convention: report rows carry `Date` fields (`createdAt`, `updatedAt`) that
 * would `safeParse`-fail a tight per-field schema before `NextResponse.json`
 * ISO-serializes them.
 *
 * `insurance` IS in `RBAC_RESOURCES` (packages/shared/src/rbac-matrix.ts):
 * read is open to every community role (owners retrieve the report for their
 * own insurer), write is admin-tier.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Form families. 1-3 story buildings use the Florida OIR uniform form; 4+ story
 * buildings use the Citizens MIT-BT forms, which home inspectors may not
 * complete. Supporting both is what makes the feature usable by high-rise
 * condos, not just low-rise HOAs.
 */
export const windMitigationFormTypeValues = ['oir_b1_1802', 'mit_bt_ii', 'mit_bt_iii'] as const;

/** Form revision — a new OIR-B1-1802 took effect 2026-04-01. */
export const windMitigationFormVersionValues = ['pre_2026', '2026_04'] as const;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

export const windMitigationListQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const windMitigationCreateBodySchema = z.object({
  communityId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  formType: z.enum(windMitigationFormTypeValues),
  formVersion: z.enum(windMitigationFormVersionValues).optional(),
  buildingLabel: z.string().max(200).nullable().optional(),
  inspectedAt: isoDateSchema,
  expiresAt: isoDateSchema,
  inspectorName: z.string().max(200).nullable().optional(),
  inspectorLicense: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const windMitigationUpdateBodySchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  documentId: z.number().int().positive().optional(),
  formType: z.enum(windMitigationFormTypeValues).optional(),
  formVersion: z.enum(windMitigationFormVersionValues).optional(),
  buildingLabel: z.string().max(200).nullable().optional(),
  inspectedAt: isoDateSchema.optional(),
  expiresAt: isoDateSchema.optional(),
  inspectorName: z.string().max(200).nullable().optional(),
  inspectorLicense: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const windMitigationDeleteQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
  communityId: z.coerce.number().int().positive(),
});

export const windMitigationListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/wind-mitigation',
  request: { query: windMitigationListQuerySchema },
  response: z.unknown(),
  permission: { resource: 'insurance', action: 'read' },
  tenantScope: { in: 'query' },
});

export const windMitigationCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/wind-mitigation',
  request: { body: windMitigationCreateBodySchema },
  response: z.unknown(),
  permission: { resource: 'insurance', action: 'write' },
  tenantScope: { in: 'body' },
});

export const windMitigationUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/wind-mitigation',
  request: { body: windMitigationUpdateBodySchema },
  response: z.unknown(),
  permission: { resource: 'insurance', action: 'write' },
  tenantScope: { in: 'body' },
});

export const windMitigationDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/wind-mitigation',
  request: { query: windMitigationDeleteQuerySchema },
  response: z.object({ deleted: z.literal(true), id: z.number() }),
  permission: { resource: 'insurance', action: 'write' },
  tenantScope: { in: 'query' },
});
