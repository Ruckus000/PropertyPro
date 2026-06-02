/**
 * Route contracts for `GET`, `POST`, and `PATCH /api/v1/contracts`.
 *
 * Plan A1 auto-drain. Vendor-contract tracking (P3-52). MULTI_METHOD file —
 * three contracts, one per exported handler.
 *
 * ---------------------------------------------------------------------------
 * GET — list contracts with bid embargo + expiration alerts
 * ---------------------------------------------------------------------------
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireComplianceCommunity (sync feature gate — hasCompliance)
 *     → requirePermission('contracts', 'read') (sync)
 *     → listContractsForCommunity / listContractBidsForCommunity
 *
 * RESPONSE-SHAPE CHANGE (the one intentional wire change in this drain):
 *   Pre-migration GET returned a BESPOKE flat envelope
 *       { data: ContractWithBids[], alerts: ExpirationAlert[] }
 *   with `alerts` as a top-level sibling of `data`. The runner only ever
 *   emits `{ data: <payload> }`, so the flat sibling cannot be reproduced
 *   without a double-wrap. Per the B1 "fold top-level meta inside data"
 *   convention, the handler now returns `{ contracts, alerts }` and the
 *   runner wraps it once → `{ data: { contracts, alerts } }`. The consumer
 *   hook `apps/web/src/hooks/use-contracts.ts` is updated in the same PR to
 *   read `json.data.contracts` / `json.data.alerts`. POST/PATCH wire shapes
 *   are unchanged (`{ data: <row> }`).
 *
 * Response intentionally typed `z.unknown()` (loose): contract rows carry
 * `Date` fields (`biddingClosesAt`, `createdAt`, `updatedAt`) that would
 * `safeParse`-fail a tight per-field schema before `NextResponse.json`
 * ISO-serializes them. The `communityId` query param is required and
 * positive — missing/non-positive yields canonical 400 `VALIDATION_ERROR`
 * (status unchanged vs. the pre-migration manual `ValidationError`).
 *
 * ---------------------------------------------------------------------------
 * POST — create contract OR create bid (dispatched by body `action` field)
 * ---------------------------------------------------------------------------
 * Auth surface for BOTH branches (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace (ASYNC — awaited, runs BEFORE membership)
 *     → requireCommunityMembership
 *     → requireComplianceCommunity (sync feature gate)
 *     → requirePermission('contracts', 'write') (sync)
 *     → create{Contract|ContractBid}ForCommunity
 *
 * Body modeled as `z.unknown()` (handler-parsed) — same pattern as
 * `auth/signup`. The POST body is POLYMORPHIC: `action: 'add_bid'` selects
 * the bid schema, anything else selects the contract schema. Each branch has
 * a DISTINCT business validation message (`'Invalid contract payload'` /
 * `'Invalid bid payload'`) that consumers/tests assert on, so the per-branch
 * `safeParse` + `ValidationError(...)` dispatch is preserved INSIDE the
 * handler rather than collapsed into the runner's generic `VALIDATION_ERROR`.
 * This keeps both messages byte-identical (corpus rule #12).
 *
 * ---------------------------------------------------------------------------
 * PATCH — update contract
 * ---------------------------------------------------------------------------
 * Auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace (ASYNC — awaited, runs BEFORE membership)
 *     → requireCommunityMembership
 *     → requireComplianceCommunity (sync feature gate)
 *     → requirePermission('contracts', 'write') (sync)
 *     → getContractById → (optional doc/checklist ownership) → updateContractById
 *
 * Body validated AT THE CONTRACT layer via `updateContractSchema`; the
 * handler's prior `safeParse('Invalid update payload')` is removed (the
 * runner has already validated by the time the handler runs — corpus rule
 * #11). Validation failures now surface the canonical `VALIDATION_ERROR`
 * envelope (status unchanged at 400). The `updateContractSchema` shape is
 * preserved field-for-field from the pre-migration route.
 *
 * `permission` metadata matches the runtime `requirePermission(membership,
 * 'contracts', <action>)` gates. `contracts` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const contractStatusValues = ['draft', 'active', 'expired', 'terminated'] as const;

/**
 * PATCH body — preserved field-for-field from the pre-migration
 * `updateContractSchema`. Exported so the handler can reuse the inferred
 * type, though `runRoute` already supplies the parsed `body`.
 */
export const updateContractBodySchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500).optional(),
  vendorName: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  contractValue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  documentId: z.number().int().positive().nullable().optional(),
  complianceChecklistItemId: z.number().int().positive().nullable().optional(),
  biddingClosesAt: z.string().datetime().nullable().optional(),
  conflictOfInterest: z.boolean().optional(),
  conflictOfInterestNote: z.string().nullable().optional(),
  status: z.enum(contractStatusValues).optional(),
});

export const contractsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/contracts',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'contracts', action: 'read' },
});

export const contractsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/contracts',
  request: {
    // Polymorphic body (create-contract vs add-bid) parsed in the handler to
    // preserve the per-branch validation messages. See docblock above.
    body: z.unknown(),
  },
  response: z.unknown(),
  permission: { resource: 'contracts', action: 'write' },
});

export const contractsUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/contracts',
  request: {
    body: updateContractBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'contracts', action: 'write' },
});
