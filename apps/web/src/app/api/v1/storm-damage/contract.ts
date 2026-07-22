/**
 * Route contracts for storm-damage intake (Wave 1 differentiation).
 *
 * MULTI_METHOD file — one `defineRoute` per exported handler in `./route.ts`.
 *
 * Auth surface:
 *   runRoute resolves communityId from `tenantScope`
 *     → requireAuthenticatedUserId
 *     → [assertNotDemoGrace — mutations only]
 *     → requireCommunityMembership
 *     → requireStormToolsCommunity (feature gate — hasStormTools)
 *     → requirePermission('storm_damage', 'read' | 'write')
 *     → [isAdminRole — status PATCH only]
 *     → createScopedClient → storm-damage-service
 *     → logAuditEvent (mutations)
 *
 * `tenantScope` is declared on every route, so `./route.ts` MUST import
 * `runRoute` from `@/lib/api/run-route` (the app-bound runner). `guard:tenant-scope`
 * enforces this.
 *
 * `storm_damage` IS in `RBAC_RESOURCES` (packages/shared/src/rbac-matrix.ts):
 * read + write are open to every resident (they file their own reports, RLS
 * scopes their reads); the admin-only status transition is additionally
 * isAdminRole-gated in the handler.
 *
 * Response is intentionally `z.unknown()` (loose), matching the insurance/
 * wind-mitigation convention: rows carry `Date` fields that would `safeParse`-fail
 * a tight schema before `NextResponse.json` ISO-serializes them.
 *
 * This records damage for the association — it is NOT an insurance claim and
 * PropertyPro is not a public adjuster (§626.854).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const stormDamageCategoryValues = [
  'roof',
  'water',
  'structural',
  'exterior',
  'common_area',
  'other',
] as const;

export const stormDamageSeverityValues = ['minor', 'moderate', 'severe'] as const;

export const stormDamageStatusValues = ['submitted', 'acknowledged', 'closed'] as const;

/** ISO-8601 datetime (the occurrence timestamp). */
const isoDateTime = z.string().datetime({ offset: true });

export const stormDamageListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/storm-damage',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      cursor: z.string().min(1).max(256).optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'storm_damage', action: 'read' },
  tenantScope: { in: 'query' },
});

export const stormDamageCreateBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive().nullable().optional(),
  occurredAt: isoDateTime.nullable().optional(),
  locationLabel: z.string().min(1).max(300),
  category: z.enum(stormDamageCategoryValues),
  severity: z.enum(stormDamageSeverityValues),
  description: z.string().min(1).max(5000),
  /** Ids of already-uploaded documents in this community's library. */
  photoDocumentIds: z.array(z.number().int().positive()).max(10).optional(),
});

export const stormDamageCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/storm-damage',
  request: { body: stormDamageCreateBodySchema },
  response: z.unknown(),
  permission: { resource: 'storm_damage', action: 'write' },
  tenantScope: { in: 'body' },
});

export const stormDamageUpdateBodySchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  status: z.enum(stormDamageStatusValues),
});

export const stormDamageUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/storm-damage',
  request: { body: stormDamageUpdateBodySchema },
  response: z.unknown(),
  permission: { resource: 'storm_damage', action: 'write' },
  tenantScope: { in: 'body' },
});
