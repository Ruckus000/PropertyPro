/**
 * Route contracts for `/api/v1/leases/offers` (Leases v3 — renewal offers).
 *
 * GET   — list offers for the given leases (managers).
 * POST  — send an offer on a current lease.
 * PATCH — move an offer on: accept, decline (schedules the move-out),
 *         withdraw, expire, or sign (creates the renewal lease).
 *
 * Permission metadata keys on `units`, like the parent leases contract (AZ-01).
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { leaseResidentInputSchema, zeroRentReasonValues } from '../contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places');

const getQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

const createOfferSchema = z
  .object({
    communityId: z.number().int().positive(),
    leaseId: z.number().int().positive(),
    offerRent: money,
    zeroRentReason: z.enum(zeroRentReasonValues).nullable().optional(),
    /** 1–36 months; omit both this and customEndDate for a month-to-month renewal. */
    termMonths: z.number().int().min(1).max(36).nullable().optional(),
    customEndDate: isoDate.nullable().optional(),
    /** Required only when renewing a month-to-month lease (it has no end date to follow). */
    startDate: isoDate.optional(),
    depositAmount: money.nullable().optional(),
    proposedResidents: z.array(leaseResidentInputSchema).min(1).max(10).optional(),
    expiresOn: isoDate,
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  })
  .strict();

const updateOfferSchema = z
  .object({
    communityId: z.number().int().positive(),
    offerId: z.number().int().positive(),
    action: z.enum(['accept', 'decline', 'withdraw', 'expire', 'sign']),
    respondedOn: isoDate.optional(),
    /** decline: the resident's last day. Defaults to the lease end date. */
    moveOutOn: isoDate.optional(),
    /** sign: the signed renewal PDF. */
    signedDocumentId: z.number().int().positive().nullable().optional(),
    /** sign: §83.575 notice days on the new term. */
    noticeDays: z.number().int().min(0).max(60).nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  })
  .strict();

export const leaseOffersGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/leases/offers',
  request: { query: getQuerySchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'query' },
});

export const leaseOffersPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/leases/offers',
  request: { body: createOfferSchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});

export const leaseOffersPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/leases/offers',
  request: { body: updateOfferSchema },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});
