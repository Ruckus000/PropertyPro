/**
 * Route contract for `GET /api/v1/packages/my`.
 *
 * Resident-only list of "my" (not-yet-picked-up) packages for the actor's
 * accessible units within a community. Used by the resident packages UX.
 *
 * Plan A1 drain #10 — mirrors drain #2 (`users/names`) query-only shape with
 * an array response. Tenant-scoped with multiple auth gates
 * (`requirePackageLoggingEnabled`, `requirePackagesReadPermission`,
 * `isResidentRole`) applied inside the route handler.
 *
 * Cleanup vs. the previous implementation: replaced the legacy
 * `parseCommunityIdFromQuery(req)` (which validated the query but did NOT
 * reconcile against the `x-community-id` header) with the canonical
 * `resolveEffectiveCommunityId(req, query.communityId)` reconciler. This
 * introduces an intentional behavior change: when the `x-community-id`
 * header and the query `communityId` disagree, the response is now 404
 * (NotFoundError from `resolveEffectiveCommunityId`) instead of silently
 * using the query value. Aligns with drains #2 / #3 semantics.
 *
 * Response is `z.array(z.unknown())` deliberately. `listMyPackagesForCommunity`
 * returns `Promise<PackageLogRow[]>`, but the canonical UI source-of-truth for
 * the per-item shape is the consumer-side `PackageListItem` TypeScript type
 * in `apps/web/src/hooks/use-packages.ts`. Over-tightening the response
 * schema here risks 500s on benign DB / service-layer additions (e.g. new
 * column on `package_log`); the loose schema preserves the runner's envelope
 * wrapping (`{data: [...]}`) without coupling to the DB row shape.
 *
 * Authorization: the contract carries `permission: { resource: 'packages',
 * action: 'read' }`, which IS in `RBAC_RESOURCES` (no placeholder needed
 * here — drains #1 / #2 used closest-semantic placeholders because their
 * resource wasn't in the matrix). The contract runner does NOT enforce
 * permissions today (Plan A1 metadata only); the route handler still calls
 * `requirePackagesReadPermission(membership)` to do the actual check.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const packagesMyQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const packagesMyContract = defineRoute({
  method: 'GET',
  path: '/api/v1/packages/my',
  request: {
    query: packagesMyQuerySchema,
  },
  response: z.array(z.unknown()),
  permission: { resource: 'packages', action: 'read' },
});
