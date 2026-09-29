/**
 * Route contracts for `/api/v1/leases/deposits` (Leases v3 — §83.49 record).
 *
 * POST  — record a deposit on a lease (also the E14 path for deposits taken
 *         before PropertyPro: received date and "notice already sent").
 * PATCH — record the notice, how it is held, or the disposition at the end.
 * A change of AMOUNT is a new row (POST), never an edit: it restarts the
 * §83.49(2) notice clock and the history must show both.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { depositHeldMethodValues } from '../contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places');

const createDepositSchema = z
  .object({
    communityId: z.number().int().positive(),
    leaseId: z.number().int().positive(),
    amount: money,
    heldMethod: z.enum(depositHeldMethodValues).nullable().optional(),
    depository: z.string().trim().max(500).nullable().optional(),
    receivedOn: isoDate.nullable().optional(),
    noticeSentOn: isoDate.nullable().optional(),
  })
  .strict();

const updateDepositSchema = z
  .object({
    communityId: z.number().int().positive(),
    depositId: z.number().int().positive(),
    heldMethod: z.enum(depositHeldMethodValues).nullable().optional(),
    depository: z.string().trim().max(500).nullable().optional(),
    receivedOn: isoDate.nullable().optional(),
    noticeSentOn: isoDate.nullable().optional(),
    disposition: z.enum(['refunded_full', 'claim_sent']).nullable().optional(),
    dispositionOn: isoDate.nullable().optional(),
    claimedAmount: money.nullable().optional(),
  })
  .strict();

export const leaseDepositsPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/leases/deposits',
  request: { body: createDepositSchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});

export const leaseDepositsPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/leases/deposits',
  request: { body: updateDepositSchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});
