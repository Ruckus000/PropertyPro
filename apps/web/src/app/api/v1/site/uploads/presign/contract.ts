/**
 * Route contract for `POST /api/v1/site/uploads/presign` (PR #2 Plan A1).
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / `withErrorHandler` / service code into the
 * client bundle. The handler in `./route.ts` is the only value-consumer.
 *
 * Step 1 of the two-step upload pattern:
 *   1. Client POSTs metadata here → receives presigned URL + token
 *   2. Client uploads bytes directly to Supabase Storage
 *   3. Client calls POST /api/v1/site/images/finalize for sharp processing
 */
import { defineRoute, z } from '@propertypro/api-contract';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB hard cap (matches bucket setting)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const sitePresignRequestSchema = z.object({
  communityId: z.number().int().positive(),
  kind: z.enum(['hero', 'content']), // 'logo' uses the existing branding upload flow
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

export const sitePresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  token: z.string(),
  storagePath: z.string(),
  expiresAt: z.string().datetime(),
});

export type SitePresignRequest = z.infer<typeof sitePresignRequestSchema>;
export type SitePresignResponse = z.infer<typeof sitePresignResponseSchema>;

export const sitePresignContract = defineRoute({
  method: 'POST',
  path: '/api/v1/site/uploads/presign',
  request: { body: sitePresignRequestSchema },
  response: sitePresignResponseSchema,
  permission: { resource: 'settings', action: 'write' },
});
