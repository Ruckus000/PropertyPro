/**
 * Route contract for `POST /api/v1/violations/evidence`.
 *
 * Plan A1 drain #144. Creates a hidden violation-evidence document from a
 * presigned upload path.
 *
 * POST uses `parseCommunityIdFromBody` (finance pattern, matches pre-migration).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createViolationEvidenceBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).optional(),
});

export const violationsEvidenceCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/violations/evidence',
  request: {
    body: createViolationEvidenceBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'violations', action: 'write' },
});
