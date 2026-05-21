/**
 * Route contracts for `/api/v1/community/contact`.
 *
 * Plan A1 drain (post-pilot drain #4). First drain that exercises the
 * runner's `body` parsing path — completes the four-runner-input matrix
 * across the drain corpus:
 *
 *   - drain #1 (me/communities):       no input (session-anchored)
 *   - drain #2 (users/names):          query only
 *   - drain #3 (ledger/balance/[id]):  params + query
 *   - drain #4 (this file, PATCH):     body
 *   - drain #4 (this file, GET):       query (mirrors drain #2's shape)
 *
 * One file, two contracts — exported separately so the GET and PATCH
 * handlers each consume the right shape.
 *
 * Authorization is tenant-scoped + admin-required for PATCH:
 *   GET   — any community member
 *   PATCH — community admin only (membership.isAdmin)
 *
 * `permission: { resource: 'settings', action: 'read' | 'write' }` is a
 * placeholder; the runner doesn't enforce it (A1 metadata only). The
 * route's PATCH handler still calls `membership.isAdmin` directly.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Per-resource shape: a community's public contact info. All fields are
 * nullable because they may be unset (the column defaults are NULL).
 */
export const communityContactSchema = z.object({
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
});

export type CommunityContactPayload = z.infer<typeof communityContactSchema>;

export const getCommunityContactContract = defineRoute({
  method: 'GET',
  path: '/api/v1/community/contact',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: communityContactSchema,
  permission: { resource: 'settings', action: 'read' },
});

/**
 * PATCH body shape. `communityId` is required; the contact fields are all
 * `.nullable().optional()` so callers can:
 *   - omit a field (preserves current value)
 *   - set a field to `null` (clears it)
 *   - set a field to a string (updates it)
 *
 * `contactEmail` keeps the pre-migration `z.string().email()` validation
 * (clearing via explicit `null` still works because `.nullable()` short-
 * circuits the email format check). `.email()` is permissive — it
 * accepts most syntactically valid addresses; deliverability checks
 * happen elsewhere if at all.
 */
export const patchCommunityContactContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/community/contact',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      contactName: z.string().nullable().optional(),
      contactEmail: z.string().email().nullable().optional(),
      contactPhone: z.string().nullable().optional(),
    }),
  },
  response: communityContactSchema,
  permission: { resource: 'settings', action: 'write' },
});
