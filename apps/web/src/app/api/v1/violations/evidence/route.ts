import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import {
  requireViolationsEnabled,
  requireViolationsWritePermission,
} from '@/lib/violations/common';
import { createUploadedDocument } from '@/lib/documents/create-uploaded-document';

const createViolationEvidenceSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createViolationEvidenceSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid violation evidence payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireViolationsEnabled(membership);
  requireViolationsWritePermission(membership);

  const result = await createUploadedDocument({
    userId: actorUserId,
    communityId,
    title: parseResult.data.title,
    description: parseResult.data.description ?? null,
    filePath: parseResult.data.filePath,
    fileName: parseResult.data.fileName,
    fileSize: parseResult.data.fileSize,
    sourceType: 'violation_evidence',
    sendDocumentNotifications: false,
  });

  return NextResponse.json({ data: result.document }, { status: 201 });
});
