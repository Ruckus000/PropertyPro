/**
 * Route contracts for `/api/v1/esign/consent`.
 *
 * Plan A1 drain #22. Two contracts in one file (mirroring drain #13's
 * GET + PATCH plumbing), but with a new wire-method: **DELETE**. This is
 * the FIRST `DELETE` handler in the contract corpus.
 *
 * `defineRoute`'s `HttpMethod` type explicitly includes `'DELETE'`; the
 * runner is method-agnostic (Next.js dispatches by exported handler name,
 * and `runRoute` only special-cases `GET` to skip body parsing — DELETE
 * is treated like POST/PATCH/PUT, but the contract here declares no body
 * schema so `parseBody` short-circuits before touching `req.json()`).
 *
 * GET — fetch consent status for the calling user within a community.
 *   Query: `{ communityId }`. Auth: `requireEsignReadPermission`.
 *   Response: loose `z.unknown()` — `getConsentStatus` returns
 *   `{ hasActiveConsent: boolean, givenAt: Date | null }`. The runner
 *   validates the handler return value before `NextResponse.json` runs,
 *   and a tight `z.object({ hasActiveConsent, givenAt: z.date().nullable() })`
 *   would `safeParse`-fail in tests that pass a real `Date` (drain #14/#18
 *   precedent). Consumer-side TypeScript pins the wire shape.
 *
 * DELETE — revoke active consent.
 *   Query: `{ communityId }`. Auth: `requireEsignWritePermission`.
 *   Response: tight `z.object({ success: z.literal(true) })` — single
 *   literal-shaped ack, drain #17 precedent (which used `{ ok: z.literal(true) }`).
 *   The field name `success` is preserved verbatim from the pre-migration
 *   handler; the wire shape stays byte-identical at `{ data: { success: true } }`.
 *
 * `permission.action` is `'read'` / `'write'` (the only members of
 * `RBAC_ACTIONS`). DELETE uses `'write'` — same action the runtime
 * `requireEsignWritePermission` enforces via
 * `requirePermission(membership, 'esign', 'write')`. There is no `'delete'`
 * action in the RBAC matrix today; `'write'` is the accurate semantic match.
 * `esign` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:51`)
 * so this is a non-placeholder permission pair.
 *
 * Behavior change vs. pre-migration:
 *   - Pre-migration used `parseCommunityIdFromQuery(req)`, which already
 *     delegates to `resolveEffectiveCommunityId` under the hood (drain #10
 *     lesson). So header/query mismatch already returned 404 — no change.
 *   - 400 body shape for invalid `communityId` becomes the canonical
 *     `VALIDATION_ERROR` envelope. Status unchanged.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const esignConsentGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/consent',
  request: { query: querySchema },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'read' },
});

export const esignConsentDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/esign/consent',
  request: { query: querySchema },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'esign', action: 'write' },
});
