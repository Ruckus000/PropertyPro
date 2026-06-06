/**
 * App-bound `runRoute` (Plan B2).
 *
 * Wraps the package's `runRoute` and injects the app's
 * `resolveEffectiveCommunityId` so a contract that declares a `query`/`body`
 * `tenantScope` gets its `communityId` resolved (reconciled against the
 * authoritative `x-community-id` middleware header) and injected into the
 * handler input — instead of the handler hand-calling
 * `resolveEffectiveCommunityId`.
 *
 * `@propertypro/api-contract` can't import app code, so the resolver is
 * dependency-injected here. **Routes that declare a query/body `tenantScope`
 * MUST import `runRoute` from this module**, not from
 * `@propertypro/api-contract` — the bare package runner has no resolver and
 * throws at request time. `guard:tenant-scope` enforces this statically.
 *
 * Routes WITHOUT a `tenantScope` may import from either module; the behavior
 * is identical (no `communityId` injection). `guard:contracts` matches
 * `runRoute(` regardless of import source, so adoption tracking is unaffected.
 */
import {
  runRoute as baseRunRoute,
  type AnyRouteContract,
  type RouteHandlerFn,
  type WrappedRouteHandler,
} from '@propertypro/api-contract';
import { resolveEffectiveCommunityId } from './tenant-context';

export function runRoute<C extends AnyRouteContract>(
  contract: C,
  handler: RouteHandlerFn<C>,
): WrappedRouteHandler {
  return baseRunRoute(contract, handler, {
    resolveCommunityId: resolveEffectiveCommunityId,
  });
}
