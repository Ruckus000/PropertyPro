/**
 * Route contract for `POST /api/v1/site/images/finalize-share-image`.
 * Website builder v4, Phase 5.
 *
 * A sibling of `finalize-favicon`, for the same reason that route is not an
 * extension of `finalize`: different output (one 1200×630 JPEG), a different
 * response, and it records the result in `communities.branding` itself so no
 * follow-up request can leave charged bytes that nothing references.
 *
 *   1. Client POSTs to /api/v1/site/uploads/presign (kind: 'share')
 *   2. Client uploads the bytes to Supabase Storage
 *   3. Client POSTs here → sharp → storage → quota → the branding write
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const shareImageFinalizeRequestSchema = z
  .object({
    communityId: z.number().int().positive(),
    storagePath: z.string().min(1).max(512),
  })
  .strict();

export const shareImageFinalizeResponseSchema = z.object({
  path: z.string(),
  bytes: z.number().int().nonnegative(),
});

export type ShareImageFinalizeResponse = z.infer<typeof shareImageFinalizeResponseSchema>;

export const shareImageFinalizeContract = defineRoute({
  method: 'POST',
  path: '/api/v1/site/images/finalize-share-image',
  request: { body: shareImageFinalizeRequestSchema },
  response: shareImageFinalizeResponseSchema,
  permission: { resource: 'settings', action: 'write' },
  // The app-bound runner reconciles `body.communityId` with the middleware
  // `x-community-id` header (header authoritative) and injects it.
  tenantScope: { in: 'body' },
});
