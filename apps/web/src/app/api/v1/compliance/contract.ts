/**
 * Route contracts for `/api/v1/compliance`.
 *
 * THREE contracts in one file (one per HTTP method). The route backs the
 * condo/HOA compliance checklist: GET lists items (with derived status),
 * POST generates the checklist from the statutory template, PATCH applies a
 * per-item action (link/unlink document, mark applicable/not-applicable).
 *
 * GET — list checklist items for a community.
 *   Query: `{ communityId }` (coerced positive int).
 *   Auth chain:
 *     requireAuthenticatedUserId
 *       → resolveEffectiveCommunityId(req, query.communityId)
 *       → requireCommunityMembership
 *       → requireCondoCommunity(membership.communityType)  (sync feature gate)
 *       → requirePermission('compliance', 'read')          (sync)
 *       → requireEntitledForAdminRead(communityId, membership)
 *       → loadChecklistWithStatus(communityId, membership.communityType)
 *   The handler returns the `data` array. The runner wraps it as
 *   `{ data: [...] }`. Each row is the stored checklist row plus derived fields
 *   (`status`, `documentState`), so every column rides along, including two the
 *   website's records screens read:
 *     - `autoLinkedDocumentId` — set only by automatic linking, in the same
 *       statement that sets `documentId`. An item counts as auto-linked while
 *       `documentId` equals it; a later manual relink or unlink moves
 *       `documentId` and leaves this behind. NULL = never auto-linked.
 *     - `notApplicableReason` — why the item was marked "doesn't apply".
 *       NULL for an applicable item, and for any item marked before reasons
 *       were recorded.
 *
 * POST — generate the checklist from the statutory template.
 *   Body: `{ communityId }` (strict — no extra keys).
 *   Auth chain (mutating method, so `assertNotDemoGrace` runs BEFORE
 *   membership):
 *     requireAuthenticatedUserId
 *       → resolveEffectiveCommunityId(req, body.communityId)
 *       → assertNotDemoGrace(communityId)                  (async — awaited)
 *       → requireCommunityMembership
 *       → requireCondoCommunity(membership.communityType)  (sync feature gate)
 *       → requirePermission('compliance', 'write')         (sync)
 *       → generate / race-recover / audit-log
 *   POST has THREE distinct return shapes, all wrapped by the runner as
 *   `{ data: <handler return> }`:
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
 *   Body: `{ id, communityId, action, documentId?, reason?, replace? }` (strict), with
 *   two refinements, each naming the field it wants:
 *     - `link_document` requires `documentId`.
 *     - `mark_not_applicable` requires `reason` — why the item doesn't apply,
 *       trimmed, 1–200 characters. The database bounds the length the same way
 *       but cannot require one, because rows marked before the column existed
 *       carry none. `mark_applicable` clears it. A `reason` sent with any
 *       other action is ignored: it is neither stored nor audited.
 *   Auth chain (mutating method — `assertNotDemoGrace` before membership):
 *     requireAuthenticatedUserId
 *       → resolveEffectiveCommunityId(req, body.communityId)
 *       → assertNotDemoGrace(communityId)                  (async — awaited)
 *       → requireCommunityMembership
 *       → requireCondoCommunity(membership.communityType)  (sync feature gate)
 *       → requirePermission('compliance', 'write')         (sync)
 *       → link_document only: the document is in this community, then one
 *         read for a conflict (`findChecklistLinkConflict`), 409 when:
 *           - another record already has this document ("This file is
 *             already posted as another record."), or
 *           - this record has a different file and `replace` is not true
 *             ("This record already has a file. Remove it first to replace
 *             it."). Only the Compliance page's re-link flow sends `replace`.
 *       → updateComplianceChecklistItem → derive status → audit-log
 *   Handler returns the decorated row; runner wraps `{ data: result }`.
 *
 * Response model — ALL THREE contracts use loose `z.unknown()`. The service
 * returns raw Drizzle rows (`Record<string, unknown>[]`) whose `deadline` /
 * `documentPostedAt` / `createdAt` fields are `Date` instances. A tight
 * `z.object({...})` would `safeParse`-fail against real `Date`s before
 * `NextResponse.json` ISO-serializes them. The POST envelope additionally
 * varies its shape per-branch, which a single tight schema could not describe.
 * Consumer-side TypeScript pins the wire shape (`json.data as
 * ChecklistItemData[]` in `useComplianceChecklist.ts`).
 *
 * `permission: { resource: 'compliance', action }` matches the runtime
 * `requirePermission(membership, 'compliance', read|write)` calls. `compliance`
 * IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:37`) — a
 * non-placeholder permission pair.
 *
 * Invalid input is a 400 `VALIDATION_ERROR` envelope with per-field errors: a
 * bad `communityId` query (GET), a bad POST body, or a bad PATCH body —
 * including a refinement above, whose error names its field (`documentId`,
 * `reason`).
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
        reason: z.string().trim().min(1).max(200).optional(),
        /**
         * `link_document` only: replace the record's current file on purpose.
         * Without it, linking a record that already has a different file is a 409.
         */
        replace: z.boolean().optional(),
      })
      .strict()
      .refine(
        (d) => d.action !== 'link_document' || d.documentId != null,
        { message: 'documentId is required when action is link_document', path: ['documentId'] },
      )
      .refine(
        (d) => d.action !== 'mark_not_applicable' || d.reason != null,
        { message: 'reason is required when action is mark_not_applicable', path: ['reason'] },
      ),
  },
  response: z.unknown(),
  permission: { resource: 'compliance', action: 'write' },
});
