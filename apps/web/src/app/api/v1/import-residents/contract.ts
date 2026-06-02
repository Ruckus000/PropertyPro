/**
 * Route contract for `POST /api/v1/import-residents`.
 *
 * Plan A1 auto-drain. Bulk-import endpoint that accepts a CSV blob and either
 * previews it (`dryRun`) or creates users / roles / notification-preferences
 * rows for each valid row.
 *
 * Auth surface (preserved verbatim from the pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace            (async — awaited; runs BEFORE membership)
 *     → requireCommunityMembership
 *     → requirePermission('residents', 'write')   (sync — NOT awaited)
 *     → import loop (CSV parse + per-row user/role inserts + audit log)
 *
 * The pre-migration handler did its own `importSchema.safeParse(body)` and
 * threw `ValidationError('Invalid import request')`. That is now expressed as
 * the contract `body` schema below; the runner validates before the handler
 * runs, so invalid payloads surface as the canonical `VALIDATION_ERROR`
 * envelope (status unchanged at 400). `resolveEffectiveCommunityId` is still
 * called explicitly inside the handler (it may override `body.communityId`
 * from request context).
 *
 * `dryRun` keeps its `.optional().default(false)` semantics — Zod fills the
 * default before the handler reads it, exactly as the inline schema did.
 *
 * Response intentionally typed `z.unknown()` (loose): the handler returns two
 * different shapes (`{ preview, errors, header }` for dryRun, vs.
 * `{ importedCount, skippedCount, errors }` for a real import). A tight schema
 * would have to union both and gains nothing — the runner only needs to wrap
 * the payload in the canonical `{ data: ... }` envelope, which is byte-identical
 * to the pre-migration `NextResponse.json({ data: ... })` calls.
 *
 * `permission: { resource: 'residents', action: 'write' }` matches the runtime
 * `requirePermission(membership, 'residents', 'write')` call. `residents` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const importResidentsContract = defineRoute({
  method: 'POST',
  path: '/api/v1/import-residents',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      csv: z.string().min(1, 'CSV text is required'),
      dryRun: z.boolean().optional().default(false),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'write' },
});
