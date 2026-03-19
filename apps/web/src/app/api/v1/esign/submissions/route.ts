import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireEsignReadPermission,
  requireEsignWritePermission,
} from '@/lib/esign/esign-route-helpers';
import {
  createSubmission,
  listSubmissions,
} from '@/lib/services/esign-service';
import type { EsignSubmissionStatus } from '@propertypro/shared';

const createSubmissionSchema = z.object({
  communityId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  signers: z.array(
    z.object({
      email: z.string().email(),
      name: z.string().trim().min(1).max(200),
      role: z.string().trim().min(1),
      sortOrder: z.number().int().min(0),
      userId: z.string().uuid().optional(),
      prefilledFields: z.record(z.string(), z.unknown()).optional(),
    }),
  ).min(1),
  signingOrder: z.enum(['parallel', 'sequential']),
  sendEmail: z.boolean(),
  expiresAt: z.string().datetime().optional(),
  messageSubject: z.string().trim().max(200).optional(),
  messageBody: z.string().trim().max(4000).optional(),
  linkedDocumentId: z.number().int().positive().optional(),
});

const listStatusSchema = z.enum([
  'pending',
  'completed',
  'declined',
  'expired',
  'cancelled',
]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireEsignReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');

  const status = rawStatus
    ? (listStatusSchema.parse(rawStatus) as EsignSubmissionStatus)
    : undefined;

  const data = await listSubmissions(communityId, { status });

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createSubmissionSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid submission payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireEsignWritePermission(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createSubmission(
    communityId,
    actorUserId,
    {
      templateId: parseResult.data.templateId,
      signers: parseResult.data.signers,
      signingOrder: parseResult.data.signingOrder,
      sendEmail: parseResult.data.sendEmail,
      expiresAt: parseResult.data.expiresAt,
      messageSubject: parseResult.data.messageSubject,
      messageBody: parseResult.data.messageBody,
      linkedDocumentId: parseResult.data.linkedDocumentId,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
