/**
 * Reserve-asset service — scoped DB access for the reserve-transparency
 * register (ADR-003: DB access lives in a service layer, not the route).
 *
 * Every function takes an already-scoped client (AGENTS #13). Callers MUST
 * verify reserve_assets read/write authorization before invoking; this layer
 * does not authorize.
 *
 * The scoped client already applies community scoping AND soft-delete exclusion
 * (buildScopeFilters), and auto-stamps `updatedAt` on update — so none of that
 * is repeated here. Listing is done in the route via the canonical `paginate()`
 * helper (ADR-003 / Plan A2); this service covers the single-row operations.
 */
import type { createScopedClient, PaginatedResult, PaginationInput } from '@propertypro/db';
import { paginate, reserveAssets } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;

export type ReserveAssetRouteRow = Record<string, unknown>;

/**
 * List reserve assets in the caller's scoped community via the canonical keyset
 * `paginate()` helper (ADR-003 / Plan A2). Keeps the `reserveAssets` table
 * reference out of the route (ADR-003 route→table-import guard).
 */
export async function paginateReserveAssetsForCommunity(
  scoped: ScopedClient,
  input: PaginationInput,
): Promise<PaginatedResult<ReserveAssetRouteRow>> {
  return paginate<ReserveAssetRouteRow>(scoped, reserveAssets, input);
}

/**
 * Fetch a single reserve asset by id inside the caller's scoped community.
 */
export async function getReserveAssetById(
  scoped: ScopedClient,
  id: number,
): Promise<ReserveAssetRouteRow | null> {
  const rows = await scoped.selectFrom(reserveAssets, {}, eq(reserveAssets.id, id));
  return (rows as unknown as ReserveAssetRouteRow[])[0] ?? null;
}

/**
 * Insert a reserve asset in the caller's scoped community. Caller MUST verify
 * reserve_assets:write authorization first.
 */
export async function createReserveAssetForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<ReserveAssetRouteRow | undefined> {
  const rows = await scoped.insert(reserveAssets, values);
  return (rows as unknown as ReserveAssetRouteRow[])[0];
}

/**
 * Update a reserve asset by id in the caller's scoped community.
 */
export async function updateReserveAssetById(
  scoped: ScopedClient,
  id: number,
  values: Record<string, unknown>,
): Promise<ReserveAssetRouteRow | undefined> {
  const rows = await scoped.update(reserveAssets, values, eq(reserveAssets.id, id));
  return (rows as unknown as ReserveAssetRouteRow[])[0];
}

/**
 * Soft-delete a reserve asset (a component that was removed or superseded).
 */
export async function softDeleteReserveAssetById(
  scoped: ScopedClient,
  id: number,
): Promise<ReserveAssetRouteRow | undefined> {
  const rows = await scoped.softDelete(reserveAssets, eq(reserveAssets.id, id));
  return (rows as unknown as ReserveAssetRouteRow[])[0];
}
