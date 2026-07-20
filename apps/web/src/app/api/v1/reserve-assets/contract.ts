/**
 * Route contracts for the reserve-transparency register (Wave 1
 * differentiation, ships DARK behind hasReserveTransparency).
 *
 * MULTI_METHOD file — one `defineRoute` per exported handler in `./route.ts`.
 *
 * Auth surface (identical across methods):
 *   runRoute resolves communityId from `tenantScope`
 *     → requireAuthenticatedUserId
 *     → [assertNotDemoGrace — mutations only, async, before membership]
 *     → requireCommunityMembership
 *     → requireReserveTransparencyCommunity (feature gate — hasReserveTransparency)
 *     → requirePermission('reserve_assets', 'read' | 'write')
 *     → createScopedClient → paginate() / reserve-asset-service
 *     → logAuditEvent (mutations)
 *
 * `tenantScope` is declared on every route, so `./route.ts` MUST import
 * `runRoute` from `@/lib/api/run-route` (the app-bound runner that injects
 * `resolveEffectiveCommunityId`). `guard:tenant-scope` enforces this.
 *
 * GET uses `paginated: true` — the list goes through the canonical keyset
 * `paginate()` helper (ADR-003 / Plan A2). Wire envelope:
 *   `{ data: { data: ReserveAssetRow[], pagination } }`.
 *
 * Response schemas are intentionally `z.unknown()` (loose): rows carry `Date`
 * fields (`createdAt`, `updatedAt`) plus the server-computed RUL fields, which
 * would `safeParse`-fail a tight per-field schema before `NextResponse.json`
 * ISO-serializes them (same convention as the wind-mitigation contract).
 *
 * `reserve_assets` IS in `RBAC_RESOURCES` (packages/shared/src/rbac-matrix.ts):
 * read is open to every community member (the register is a transparent,
 * factual record), write is admin-tier.
 *
 * COMPLIANCE: this route returns factual record data only. Any framing copy
 * lives in the attorney-reviewed constants in `@/lib/constants/reserve-disclaimers`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Major-component categories. CHECK-constrained in the DB; mirrored here and in
 * packages/db/src/schema/reserve-assets.ts.
 */
export const reserveAssetCategoryValues = [
  'roof',
  'structure',
  'elevator',
  'pool',
  'paving',
  'mechanical',
  'exterior',
  'other',
] as const;

/** A reasonable calendar-year window — guards against typos like year 20 or 9999. */
const yearSchema = z.number().int().gte(1900).lte(2200);
/** Useful life in whole years. Positive and bounded so the RUL math stays sane. */
const usefulLifeSchema = z.number().int().positive().max(200);
/** Non-negative integer cents; bounded well under Number.MAX_SAFE_INTEGER. */
const centsSchema = z.number().int().min(0).max(1_000_000_000_000);

export const reserveAssetsListQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const reserveAssetCreateBodySchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  category: z.enum(reserveAssetCategoryValues),
  yearInstalled: yearSchema,
  usefulLifeYears: usefulLifeSchema,
  replacementCostCents: centsSchema.nullable().optional(),
  currentReserveCents: centsSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const reserveAssetUpdateBodySchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  category: z.enum(reserveAssetCategoryValues).optional(),
  yearInstalled: yearSchema.optional(),
  usefulLifeYears: usefulLifeSchema.optional(),
  replacementCostCents: centsSchema.nullable().optional(),
  currentReserveCents: centsSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const reserveAssetDeleteQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
  communityId: z.coerce.number().int().positive(),
});

export const reserveAssetsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/reserve-assets',
  request: { query: reserveAssetsListQuerySchema },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'reserve_assets', action: 'read' },
  tenantScope: { in: 'query' },
});

export const reserveAssetCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/reserve-assets',
  request: { body: reserveAssetCreateBodySchema },
  response: z.unknown(),
  permission: { resource: 'reserve_assets', action: 'write' },
  tenantScope: { in: 'body' },
});

export const reserveAssetUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/reserve-assets',
  request: { body: reserveAssetUpdateBodySchema },
  response: z.unknown(),
  permission: { resource: 'reserve_assets', action: 'write' },
  tenantScope: { in: 'body' },
});

export const reserveAssetDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/reserve-assets',
  request: { query: reserveAssetDeleteQuerySchema },
  response: z.object({ deleted: z.literal(true), id: z.number() }),
  permission: { resource: 'reserve_assets', action: 'write' },
  tenantScope: { in: 'query' },
});
