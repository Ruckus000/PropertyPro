/**
 * Route contracts for `/api/v1/notice-consent` — the signed-in owner's own
 * consent to electronic notice (§718.112(2)(d), §720.303).
 *
 * Self-scoped: every verb acts on the caller's row only, and there is no
 * userId parameter to point it anywhere else. Managers see consent through the
 * residents list, never through this route.
 *
 * `permission` is metadata only (the runner does not enforce it). `settings`
 * is the nearest RBAC resource: this sits beside notification preferences.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const querySchema = z.object({ communityId: z.coerce.number().int().positive() });

const stateSchema = z.object({
  consented: z.boolean(),
  givenAt: z.string().nullable(),
  version: z.string().nullable(),
  /** The address the active consent covers. */
  email: z.string().nullable(),
  /** The caller's sign-in email now — what a new consent would cover. */
  currentEmail: z.string().nullable(),
});
export type NoticeConsentDto = z.infer<typeof stateSchema>;

export const noticeConsentGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/notice-consent',
  request: { query: querySchema },
  response: stateSchema,
  permission: { resource: 'settings', action: 'read' },
  tenantScope: { in: 'query' },
});

export const noticeConsentPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/notice-consent',
  request: { query: querySchema },
  response: stateSchema,
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'query' },
});

export const noticeConsentDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/notice-consent',
  request: { query: querySchema },
  response: stateSchema,
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'query' },
});
