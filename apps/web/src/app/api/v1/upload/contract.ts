/**
 * Route contract for `POST /api/v1/upload`.
 *
 * Plan A1 auto-drain. Generates a presigned Supabase Storage upload URL for
 * direct browser-to-storage uploads (Vercel's 4.5MB request-body limit means
 * files must NOT transit the API). This route is intentionally non-audited —
 * it mints a presigned URL but mutates no app records; the audited document
 * record is created later by `POST /api/v1/documents`.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                (async — awaited)
 *     → requireCommunityMembership        (async — awaited)
 *     → validateFileSize(mimeType, fileSize)  (image vs document byte cap)
 *     → createPresignedUploadUrl('documents', storagePath, { upsert: false })
 *
 * This route has NO `requirePermission` gate (any community member may mint a
 * presigned upload URL), so the contract declares no `permission` metadata.
 *
 * The body is validated by the runner against this contract's Zod schema. The
 * pre-migration handler validated the same shape by hand
 * (`presignSchema.safeParse` → `ValidationError('Invalid upload metadata')`)
 * and formatted Zod errors via `formatZodErrors`. Post-migration, validation
 * failures (missing/invalid body fields) shift to the canonical
 * `VALIDATION_ERROR` envelope. Status code unchanged at 400.
 *
 * The per-mimeType `validateFileSize` cap (10MB images / 50MB documents) is a
 * business rule that cannot be expressed in the body schema (it depends on
 * `mimeType` and `fileSize` together), so it stays in the handler and still
 * throws `ValidationError` with its byte-identical message.
 *
 * Response is a synthesized plain object — `{ documentId, path, token,
 * uploadUrl, expiresIn }` — with NO `Date` fields, so a tight `z.object`
 * schema is safe (unlike Drizzle-row responses, which need loose
 * `z.unknown()` to avoid `safeParse`-failing real `Date` instances). Success
 * wire shape `{ data: ... }` is byte-identical to pre-migration.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const uploadPresignContract = defineRoute({
  method: 'POST',
  path: '/api/v1/upload',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      fileName: z.string().min(1).max(255),
      mimeType: z.string().min(1),
      fileSize: z.number().int().positive(),
    }),
  },
  response: z.object({
    documentId: z.string(),
    path: z.string(),
    token: z.string(),
    uploadUrl: z.string(),
    expiresIn: z.number(),
  }),
});
