/**
 * Route contracts for `/api/v1/leases` (P2-37).
 *
 * Plan A1 drain. Four contracts in one file — one per wire method
 * (GET / POST / PATCH / DELETE). Lease CRUD with expiration tracking and a
 * renewal chain.
 *
 * --- Validation-layer split (corpus rule 11) ---
 * The contract owns ONLY the input shapes that the pre-migration route
 * validated via Zod at the top of each handler. The handlers then run their
 * own *business-rule* validation (apartment feature gate, unit existence,
 * tenant-role check, lease-date-window, lease-overlap, renewal-continuity).
 * Those are NOT schema concerns and stay in the handlers, byte-identical.
 *
 * GET — list leases for a community with optional filters.
 *   Query schema declares ONLY the required `communityId`. The optional
 *   filters (`status`, `unit`, `expiring_within_days`, `renewal_chain_for`)
 *   are read manually from `req.url` in the handler (corpus rule 7): the
 *   pre-migration code silently ignored malformed filter values
 *   (`?unit=garbage` → no filter applied) rather than 400-ing, and declaring
 *   them in Zod would change that to a hard 400. Manual parsing preserves the
 *   lenient semantics exactly.
 *   Response: loose `z.unknown()` — the handler returns Drizzle-derived
 *   `LeaseRecord[]` (or a renewal chain), whose rows are plain JSON but are
 *   typed loosely upstream; a tight schema buys nothing and risks
 *   safeParse-failing on shape drift. Consumer TS (`use-leases.ts`) pins the
 *   wire shape to `LeaseApiItem[]`.
 *
 * POST — create a lease. Body schema = the pre-migration `createLeaseSchema`.
 *   Response: loose `z.unknown()` (Drizzle row from `createLeaseForCommunity`).
 *
 * PATCH — update a lease. Body schema = the pre-migration `updateLeaseSchema`.
 *   Response: loose `z.unknown()` (Drizzle row from `updateLeaseForCommunity`).
 *
 * DELETE — soft-delete a lease. Query schema = the pre-migration
 *   `deleteLeaseSchema` (`id` + `communityId`). The pre-migration handler read
 *   these from `searchParams` and `Number()`-coerced them, so a non-numeric
 *   `?id=abc` produced `NaN` → `positive()` fail → 400. `z.coerce.number()`
 *   reproduces this (empty/garbage → coercion NaN → 400). Status unchanged.
 *   Response: tight `z.object({ deleted: z.literal(true), id: z.number() })` —
 *   a synthesized ack with no Date fields (corpus rule 5). Wire shape stays
 *   byte-identical at `{ data: { deleted: true, id } }`.
 *
 * --- permission metadata (AZ-01) ---
 * `leases` is intentionally NOT a member of `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:13` — "leases: NOT in this matrix
 * (separate apartment feature gate)"), so there is no `leases` matrix row to
 * name. The entries below therefore key on the REAL resource the route
 * enforces: `units`. Mutations require `units:write`, which is true on the
 * `manager` row only — that is the new gate in `./route.ts`.
 *
 * GET declares `units:read` and documents an asymmetry on purpose: `units:read`
 * is true for every row of the matrix, so that entry is descriptive metadata,
 * not a gate the route needs — what bounds a non-manager's read is the
 * party-scoped ROW FILTER (`residentId === actorUserId`) in the handler, not a
 * matrix query. A future guard that cross-checks `contract.permission` against
 * call sites (AZ-05) must not read GET as a missing `requirePermission` call.
 *
 * Interim vocabulary: `units` is the closest existing resource, not a claim
 * that leases ARE units. Phase 2.1 adds a real `leases` entry to
 * `RBAC_RESOURCES` and re-keys these four plus the three call sites. Still
 * metadata only — the runner does not enforce it.
 *
 * --- behavior changes vs. pre-migration ---
 *   - GET: the bespoke 400 messages (`communityId query parameter is
 *     required` / `communityId must be a positive integer`) become the
 *     canonical `VALIDATION_ERROR` envelope. Status unchanged at 400; no
 *     consumer reads `json.error.message` for these.
 *   - POST/PATCH/DELETE: invalid-input 400 bodies become the canonical
 *     `VALIDATION_ERROR` envelope. The business-rule 400s
 *     (`Unit not found...`, `...tenant role...`, `...overlaps...`, etc.)
 *     are thrown by the handler post-validation and are preserved
 *     byte-identical.
 *   - All success wire shapes (`{ data: ... }`) are byte-identical.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const leaseStatusValues = ['active', 'expired', 'renewed', 'terminated', 'cancelled'] as const;

// --- Leases v3 shapes (all optional: the pre-v3 wire shape keeps working) ---

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places');

export const zeroRentReasonValues = ['staff', 'courtesy_officer', 'rent_free_agreement', 'other'] as const;
export const leaseEndViaValues = ['notice', 'declined', 'early', 'transfer', 'expiry'] as const;
export const depositHeldMethodValues = ['separate_noninterest', 'separate_interest', 'surety_bond'] as const;

/**
 * One resident on a lease: an existing user, an existing contact, or a new
 * contact-only person. Contacts are refused unless the community has turned on
 * `leasesAllowResidentsWithoutEmail` (checked in the handler, not here).
 */
export const leaseResidentInputSchema = z.union([
  z.object({ userId: z.string().uuid(), isPrimary: z.boolean().optional() }).strict(),
  z.object({ contactId: z.number().int().positive(), isPrimary: z.boolean().optional() }).strict(),
  z
    .object({
      newContact: z
        .object({
          fullName: z.string().trim().min(1).max(200),
          phone: z.string().trim().max(40).nullable().optional(),
          mailingAddress: z.string().trim().max(500).nullable().optional(),
          noticeDelivery: z.enum(['mail', 'hand']).optional(),
        })
        .strict(),
      isPrimary: z.boolean().optional(),
    })
    .strict(),
]);

export const leaseDepositInputSchema = z
  .object({
    amount: money,
    heldMethod: z.enum(depositHeldMethodValues).nullable().optional(),
    depository: z.string().trim().max(500).nullable().optional(),
    receivedOn: isoDate.nullable().optional(),
    noticeSentOn: isoDate.nullable().optional(),
  })
  .strict();

const getQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

const createLeaseSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  /** Pre-v3 single resident. Either this or `residents` is required. */
  residentId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .nullable()
    .optional(),
  rentAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places')
    .nullable()
    .optional(),
  status: z.enum(leaseStatusValues).optional(),
  previousLeaseId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** When true, creating a renewal: sets previousLeaseId and marks old lease as 'renewed' */
  isRenewal: z.boolean().optional(),
  // Leases v3
  residents: z.array(leaseResidentInputSchema).min(1).max(10).optional(),
  zeroRentReason: z.enum(zeroRentReasonValues).nullable().optional(),
  zeroRentNote: z.string().trim().max(500).nullable().optional(),
  noticeDays: z.number().int().min(0).max(60).nullable().optional(),
  deposit: leaseDepositInputSchema.nullable().optional(),
  signedDocumentId: z.number().int().positive().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

const updateLeaseSchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  status: z.enum(leaseStatusValues).optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .nullable()
    .optional(),
  rentAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places')
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
  // Leases v3
  /** The version the client read. When sent, a stale version is a 409. */
  version: z.number().int().positive().optional(),
  zeroRentReason: z.enum(zeroRentReasonValues).nullable().optional(),
  zeroRentNote: z.string().trim().max(500).nullable().optional(),
  noticeDays: z.number().int().min(0).max(60).nullable().optional(),
  moveOutOn: isoDate.nullable().optional(),
  endVia: z.enum(leaseEndViaValues).nullable().optional(),
  endReason: z.string().trim().max(500).nullable().optional(),
  noticeReceivedOn: isoDate.nullable().optional(),
  cancelledReason: z.string().trim().min(1).max(500).optional(),
  signedDocumentId: z.number().int().positive().nullable().optional(),
});

const deleteQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
  communityId: z.coerce.number().int().positive(),
});

export const leasesGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/leases',
  request: { query: getQuerySchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'read' },
  tenantScope: { in: 'query' },
});

export const leasesPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/leases',
  request: { body: createLeaseSchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});

export const leasesPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/leases',
  request: { body: updateLeaseSchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});

export const leasesDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/leases',
  request: { query: deleteQuerySchema },
  response: z.object({ deleted: z.literal(true), id: z.number() }),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'query' },
});
