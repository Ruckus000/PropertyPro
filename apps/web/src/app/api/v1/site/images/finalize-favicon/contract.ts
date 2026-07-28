/**
 * Route contract for `POST /api/v1/site/images/finalize-favicon`.
 * Website editor v3, Phase 8.
 *
 * A SIBLING of `site/images/finalize`, not an extension of it. That route's
 * response (`variant1600Path` / `variant800Path`) is shipped and consumed by
 * the hero and gallery forms; adding a `kind` discriminant would change a live
 * contract to no benefit. This one produces different variants and returns a
 * different shape, so it gets its own path and its own contract — which also
 * buys it the contract auto-suite for free.
 *
 * Step 2 of the two-step upload pattern:
 *   1. Client POSTs metadata to /api/v1/site/uploads/presign (kind: 'favicon')
 *   2. Client uploads bytes directly to Supabase Storage using that URL
 *   3. Client POSTs here → sharp transformations + variant storage + quota
 *      + the branding write
 *
 * Unlike its sibling, step 3 also RECORDS the result in `communities.branding`.
 * Splitting that into a follow-up PATCH leaves an orphan window: the variants
 * land in storage and the quota increments, then the browser dies before the
 * PATCH, and the community is charged for bytes nothing references and nothing
 * can find.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const faviconFinalizeRequestSchema = z
  .object({
    communityId: z.number().int().positive(),
    storagePath: z.string().min(1).max(512),
  })
  .strict();

export const faviconFinalizeResponseSchema = z.object({
  icon32Path: z.string(),
  appleTouch180Path: z.string(),
});

export type FaviconFinalizeRequest = z.infer<typeof faviconFinalizeRequestSchema>;
export type FaviconFinalizeResponse = z.infer<typeof faviconFinalizeResponseSchema>;

export const faviconFinalizeContract = defineRoute({
  method: 'POST',
  path: '/api/v1/site/images/finalize-favicon',
  request: { body: faviconFinalizeRequestSchema },
  response: faviconFinalizeResponseSchema,
  permission: { resource: 'settings', action: 'write' },
});
