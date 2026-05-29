/**
 * Route contract for `POST /api/v1/esign/templates/upload`.
 *
 * Plan A1 drain #135. Presigned PDF upload for e-sign template source files.
 *
 * POST uses `parseCommunityIdFromBody` (matches esign/templates collection #124).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const MAX_TEMPLATE_BYTES = 50 * 1024 * 1024;

const uploadTemplateBodySchema = z.object({
  communityId: z.number().int().positive(),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_TEMPLATE_BYTES),
  mimeType: z.literal('application/pdf'),
});

export const esignTemplateUploadContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/templates/upload',
  request: {
    body: uploadTemplateBodySchema,
  },
  response: z.object({
    path: z.string(),
    token: z.string(),
    uploadUrl: z.string(),
    expiresIn: z.number().int().positive(),
  }),
  permission: { resource: 'esign', action: 'write' },
});
