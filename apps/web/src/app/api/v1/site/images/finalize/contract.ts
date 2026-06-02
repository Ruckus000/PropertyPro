/**
 * Route contract for `POST /api/v1/site/images/finalize` (PR #2).
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / `withErrorHandler` / service code into the
 * client bundle. The handler in `./route.ts` is the only value-consumer.
 *
 * Step 2 of the two-step upload pattern:
 *   1. Client POSTs metadata to /api/v1/site/uploads/presign → presigned URL
 *   2. Client uploads bytes directly to Supabase Storage using that URL
 *   3. Client POSTs here → sharp transformations + variant storage + quota
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const siteFinalizeRequestSchema = z.object({
  communityId: z.number().int().positive(),
  storagePath: z.string().min(1).max(512),
  altText: z.string().min(1).max(200),
  cropBox: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
});

export const siteFinalizeResponseSchema = z.object({
  variant1600Path: z.string(),
  variant800Path: z.string(),
  altText: z.string(),
});

export type SiteFinalizeRequest = z.infer<typeof siteFinalizeRequestSchema>;
export type SiteFinalizeResponse = z.infer<typeof siteFinalizeResponseSchema>;

export const siteFinalizeContract = defineRoute({
  method: 'POST',
  path: '/api/v1/site/images/finalize',
  request: { body: siteFinalizeRequestSchema },
  response: siteFinalizeResponseSchema,
  permission: { resource: 'settings', action: 'write' },
});
