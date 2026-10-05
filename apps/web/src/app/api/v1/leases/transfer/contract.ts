/**
 * Route contract for `POST /api/v1/leases/transfer` (Leases v3, E8).
 *
 * Moves the residents of a current lease to another unit: the old lease gets
 * a move-out (end_via 'transfer') and a new lease opens on the new unit, linked
 * by transferred_from_lease_id. Decisions §1 option A — the lease row is never
 * re-pointed, because obligations, payments and the rent trigger are keyed by
 * unit.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { zeroRentReasonValues } from '../contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places');

export const leaseTransferPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/leases/transfer',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        fromLeaseId: z.number().int().positive(),
        toUnitId: z.number().int().positive(),
        /** Last day in the old unit. */
        moveOutOn: isoDate,
        /** First day in the new unit (the 1st of a month — decisions D8). */
        startDate: isoDate,
        endDate: isoDate.nullable().optional(),
        rentAmount: money,
        zeroRentReason: z.enum(zeroRentReasonValues).nullable().optional(),
        zeroRentNote: z.string().trim().max(500).nullable().optional(),
        noticeDays: z.number().int().min(0).max(60).nullable().optional(),
        /** Carry the deposit to the new lease (true) or settle it on move-out (false). */
        carryDeposit: z.boolean(),
        /** New deposit amount when it differs from the carried one. */
        depositAmount: money.nullable().optional(),
        reason: z.string().trim().max(500).nullable().optional(),
        idempotencyKey: z.string().trim().min(8).max(100).optional(),
      })
      .strict(),
  },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});
