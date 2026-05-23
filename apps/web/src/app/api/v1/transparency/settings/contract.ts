/**
 * Route contracts for `/api/v1/transparency/settings`.
 *
 * Plan A1 drain #16. Mirrors drain #4 (community/contact) and drain #13
 * (payments/fee-policy) two-contracts-per-file GET+PATCH with audit log.
 *
 * Additional complexity preserved at the handler level (NOT in the schemas):
 *   - Conditional "acknowledged must be true on first enable" check. This
 *     depends on the current persisted `acknowledgedAt` being null AND the
 *     new `enabled` being true; not expressible at the schema layer without
 *     side-channel access to the DB. Stays a route-level runtime check via
 *     `ValidationError('Transparency scope acknowledgment is required ...')`.
 *   - Checklist-must-exist side effect. Calls
 *     `ensureTransparencyChecklistInitialized(communityId, communityType)` when
 *     enabling; if the resulting checklist is empty, throws
 *     `ValidationError('Generate your compliance checklist ...')`.
 *   - `acknowledgedAt` Date↔ISO string conversion. The transparency service
 *     returns `acknowledgedAt: Date | null`, but the runner's `safeParse`
 *     runs BEFORE `NextResponse.json` serialization — so the response schema
 *     declares `z.string().nullable()` and the handler calls `.toISOString()`
 *     explicitly before returning. Same pattern as drain #9 (account/profile).
 *
 * Authorization:
 *   GET   — any member of the community whose `communityType` features
 *           include `hasTransparencyPage`, with `settings:read` permission
 *           (`requirePermission(membership, 'settings', 'read')`).
 *   PATCH — same membership/feature gates plus `settings:write` permission,
 *           additionally blocked during the demo grace window
 *           (`assertNotDemoGrace`).
 *
 * `permission: { resource: 'settings', action: 'read' | 'write' }` is the
 * placeholder taxonomy used by earlier drains (`settings` is not yet in
 * `RBAC_RESOURCES`). The runner does NOT enforce it — the route still calls
 * `requirePermission(membership, 'settings', ...)` directly. Kept in step
 * with the in-route permission check rather than swapped to a non-placeholder
 * member.
 *
 * Behavior change vs. pre-migration: NONE w.r.t. header/query reconciliation.
 * Pre-migration ALREADY routes both GET and PATCH through
 * `resolveEffectiveCommunityId(req, X)`, so the `x-community-id` header is
 * already authoritative and a header/query (or header/body) mismatch already
 * returns 404. This is the same drain #4 precedent (no migration delta here).
 *
 * Wire-shape behavior change: invalid query / body shape now returns the
 * runner's `VALIDATION_ERROR` envelope with per-field details (was: a
 * hand-constructed `ValidationError` with a single message). Status unchanged
 * (400). Business-rule errors (`'Generate your compliance checklist ...'`
 * and `'Transparency scope acknowledgment is required ...'`) continue to use
 * the in-route `ValidationError`, surfaced through `withErrorHandler` as the
 * existing 400 envelope — those messages are preserved verbatim because the
 * consumer (`useUpdateTransparencySettings` in `apps/web/src/hooks/use-transparency.ts`)
 * reads them directly via `json.error?.message`.
 *
 * Response shape (both GET and PATCH return the same):
 *   `{ enabled: boolean, acknowledgedAt: string | null }`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const transparencySettingsResponseSchema = z.object({
  enabled: z.boolean(),
  acknowledgedAt: z.string().nullable(),
});

export type TransparencySettingsResponse = z.infer<
  typeof transparencySettingsResponseSchema
>;

export const getTransparencySettingsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/transparency/settings',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: transparencySettingsResponseSchema,
  permission: { resource: 'settings', action: 'read' },
});

/**
 * PATCH body schema. `.strict()` is preserved verbatim from the pre-migration
 * route — extra fields are rejected with `VALIDATION_ERROR` rather than
 * silently ignored. `acknowledged` is optional at the schema layer; the
 * "required on first enable" check is performed at the route level once
 * `current.acknowledgedAt` is known.
 */
export const patchTransparencySettingsContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/transparency/settings',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        enabled: z.boolean(),
        acknowledged: z.boolean().optional(),
      })
      .strict(),
  },
  response: transparencySettingsResponseSchema,
  permission: { resource: 'settings', action: 'write' },
});
