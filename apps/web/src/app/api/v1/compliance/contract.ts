/**
 * Route contracts for `/api/v1/compliance` — Plan A1 auto-drain.
 *
 * THREE contracts in one file (one per HTTP method). The route backs the
 * condo/HOA compliance checklist: GET lists items (with derived status),
 * POST generates the checklist from the statutory template, PATCH applies a
 * per-item action (link/unlink document, mark applicable/not-applicable).
 *
 * GET — list checklist items for a community.
 *   Query: `{ communityId }` (coerced positive int — pre-migration used a
 *   `z.coerce.number().int().positive()` safeParse on `?communityId=`).
 *   Auth chain (preserved verbatim):
 *     requireAuthenticatedUserId
 *       → resolveEffectiveCommunityId(req, query.communityId)
 *       → requireCommunityMembership
 *       → requireCondoCommunity(membership.communityType)  (sync feature gate)
 *       → requirePermission('compliance', 'read')          (sync)
 *       → listComplianceChecklistItems(communityId)
 *   The handler returns the `data` array (each row decorated with a derived
 *   `status`). The runner wraps it as `{ data: [...] }` — byte-identical to
 *   the pre-migration `NextResponse.json({ data })`.
 *
 * POST — generate the checklist from the statutory template.
 *   Body: `{ communityId }` (strict — no extra keys).
 *   Auth chain (preserved verbatim, mutating method so `assertNotDemoGrace`
 *   runs BEFORE membership):
 *     requireAuthenticatedUserId
 *       → resolveEffectiveCommunityId(req, body.communityId)
 *       → assertNotDemoGrace(communityId)                  (async — awaited)
 *       → requireCommunityMembership
 *       → requireCondoCommunity(membership.communityType)  (sync feature gate)
 *       → requirePermission('compliance', 'write')         (sync)
 *       → generate / race-recover / audit-log
 *   POST has THREE distinct return shapes, all wrapped by the runner as
 *   `{ data: <handler return> }`, preserving the pre-migration wire shapes
 *   byte-identical:
 *     - already-generated / race-recovered: handler returns
 *       `{ data: existing, meta: { alreadyGenerated: true } }`
 *       → wire `{ data: { data: existing, meta: { alreadyGenerated: true } } }`
 *     - empty-template: handler returns
 *       `{ data: [], meta: { emptyTemplate: true } }`
 *       → wire `{ data: { data: [], meta: { emptyTemplate: true } } }`
 *     - normal success: handler returns the `inserted` array
 *       → wire `{ data: inserted }`
 *
 * PATCH — apply a single per-item action.
 *   Body: `{ id, communityId, action, documentId? }` (strict + the
 *   `link_document ⇒ documentId required` refinement preserved verbatim).
 *   Auth chain (mutating method — `assertNotDemoGrace` before membership):
 *     requireAuthenticatedUserId
 *       → resolveEffectiveCommunityId(req, body.communityId)
 *       → assertNotDemoGrace(communityId)                  (async — awaited)
 *       → requireCommunityMembership
 *       → requireCondoCommunity(membership.communityType)  (sync feature gate)
 *       → requirePermission('compliance', 'write')         (sync)
 *       → updateComplianceChecklistItem → derive status → audit-log
 *   Handler returns the decorated row; runner wraps `{ data: result }`.
 *
 * Response model — ALL THREE contracts use loose `z.unknown()`. The service
 * returns raw Drizzle rows (`Record<string, unknown>[]`) whose `deadline` /
 * `documentPostedAt` / `createdAt` fields are `Date` instances. A tight
 * `z.object({...})` would `safeParse`-fail against real `Date`s before
 * `NextResponse.json` ISO-serializes them (drain #14/#18/#42/#50 precedent).
 * The POST envelope additionally varies its shape per-branch, which a single
 * tight schema could not describe. Consumer-side TypeScript pins the wire
 * shape (`json.data as ChecklistItemData[]` in `useComplianceChecklist.ts`).
 *
 * `permission: { resource: 'compliance', action }` matches the runtime
 * `requirePermission(membership, 'compliance', read|write)` calls. `compliance`
 * IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:37`) — a
 * non-placeholder permission pair.
 *
 * Behavior change vs. pre-migration: 400 bodies for invalid `communityId`
 * query (GET), invalid POST body, and invalid PATCH body all shift to the
 * canonical `VALIDATION_ERROR` envelope. Status code unchanged at 400. The
 * `link_document ⇒ documentId` refinement message is now surfaced under the
 * canonical envelope's field errors rather than the legacy `fields` array,
 * but the consumer (`useComplianceMutations`) reads `err.message` opaquely on
 * `!res.ok` and already saw the canonical `{ error: { message } }` envelope
 * pre-migration (the route already used `withErrorHandler`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const complianceGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/compliance',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'compliance', action: 'read' },
});

export const complianceGenerateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/compliance',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
      })
      .strict(),
  },
  response: z.unknown(),
  permission: { resource: 'compliance', action: 'write' },
});

export const compliancePatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/compliance',
  request: {
    body: z
      .object({
        id: z.number().int().positive(),
        communityId: z.number().int().positive(),
        action: z.enum([
          'link_document',
          'unlink_document',
          'mark_not_applicable',
          'mark_applicable',
        ]),
        documentId: z.number().int().positive().optional(),
      })
      .strict()
      .refine(
        (d) => d.action !== 'link_document' || d.documentId != null,
        { message: 'documentId is required when action is link_document', path: ['documentId'] },
      ),
  },
  response: z.unknown(),
  permission: { resource: 'compliance', action: 'write' },
});
