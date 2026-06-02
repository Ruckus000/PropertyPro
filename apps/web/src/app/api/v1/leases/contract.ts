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
 * --- permission metadata ---
 * `leases` is intentionally NOT a member of `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:13` — "leases: NOT in this matrix
 * (separate apartment feature gate)"). The route enforces access via
 * `requireApartmentCommunity(membership.communityType)`, not
 * `requirePermission`. The `permission.resource: 'leases'` entries below are
 * therefore DOCUMENTED PLACEHOLDERS — metadata only, not enforced by the
 * runner — kept for codegen/doc completeness.
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

const leaseStatusValues = ['active', 'expired', 'renewed', 'terminated'] as const;

const getQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

const createLeaseSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  residentId: z.string().uuid(),
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
  permission: { resource: 'leases', action: 'read' },
});

export const leasesPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/leases',
  request: { body: createLeaseSchema },
  response: z.unknown(),
  permission: { resource: 'leases', action: 'write' },
});

export const leasesPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/leases',
  request: { body: updateLeaseSchema },
  response: z.unknown(),
  permission: { resource: 'leases', action: 'write' },
});

export const leasesDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/leases',
  request: { query: deleteQuerySchema },
  response: z.object({ deleted: z.literal(true), id: z.number() }),
  permission: { resource: 'leases', action: 'write' },
});
