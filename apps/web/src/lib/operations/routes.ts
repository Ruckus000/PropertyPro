/**
 * Canonical route builder for the Operations hub.
 *
 * Single source of truth for every operations-family URL surfaced by the
 * feature registry, command palette, help task cards, onboarding snapshot,
 * and the hub itself. The CI guard at scripts/verify-operations-routes.ts
 * verifies every registry entry flows through this module.
 *
 * This module is server-safe. It is imported from both server components
 * (feature-registry, redirect pages) and client components (operations-hub).
 * The rollback flag is read at module top-level; client bundles ship the
 * current build's flag state, so rollback requires a redeploy to take effect.
 * This is intentional.
 */

export type OperationsTab = 'all' | 'requests' | 'work-orders' | 'reservations';

const OPERATIONS_TABS: readonly OperationsTab[] = ['all', 'requests', 'work-orders', 'reservations'];

const LEGACY_REDIRECT_PARAM_ALLOWLIST = ['status', 'priority', 'unitId', 'q'] as const;

const USE_V1_ROUTES = process.env.OPERATIONS_HUB_ROUTING === 'v1';

function assertValidCommunityId(cid: unknown): asserts cid is number {
  if (typeof cid !== 'number' || !Number.isInteger(cid) || cid <= 0) {
    throw new TypeError(
      `operations/routes: communityId must be a positive integer, got ${String(cid)}`,
    );
  }
}

export function operationsTabHref(communityId: number, tab: OperationsTab): string {
  assertValidCommunityId(communityId);

  if (USE_V1_ROUTES) {
    if (tab === 'work-orders') return `/work-orders?communityId=${communityId}`;
    if (tab === 'reservations') return `/amenities?communityId=${communityId}`;
    return `/maintenance/submit?communityId=${communityId}`;
  }

  return `/communities/${communityId}/operations?tab=${tab}`;
}

export function operationsHubHref(
  communityId: number,
  tab?: OperationsTab,
  extras?: { from?: 'maintenance'; scope?: 'mine' | 'community' },
): string {
  assertValidCommunityId(communityId);

  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  if (extras?.from) params.set('from', extras.from);
  if (extras?.scope) params.set('scope', extras.scope);

  const query = params.toString();
  return query
    ? `/communities/${communityId}/operations?${query}`
    : `/communities/${communityId}/operations`;
}

/**
 * Extract filter params from a legacy maintenance redirect's incoming
 * searchParams, allowlisting only the keys the Operations hub honors.
 * Callers then append `from=maintenance&tab=requests`.
 */
export function buildLegacyRedirectParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of LEGACY_REDIRECT_PARAM_ALLOWLIST) {
    const value = searchParams[key];
    if (typeof value === 'string' && value.length > 0) {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Sentinel set used by scripts/verify-operations-routes.ts to confirm
 * registry entries for operations-family surfaces flow through this module.
 * Must be computed after the helpers are defined.
 */
export const KNOWN_OPERATIONS_HREFS: ReadonlySet<string> = new Set(
  OPERATIONS_TABS.map((tab) => operationsTabHref(1, tab)).concat(operationsHubHref(1)),
);
