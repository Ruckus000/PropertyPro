import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  communities,
  complianceChecklistItems,
  createScopedClient,
  logAuditEvent,
} from '@propertypro/db';
import {
  COMMUNITY_TYPES,
  getComplianceTemplate,
  type CommunityType,
} from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  calculateComplianceStatus,
  calculatePostingDeadline,
} from '@/lib/utils/compliance-calculator';

const communityIdQuerySchema = z.coerce.number().int().positive();

const generateChecklistSchema = z.object({
  communityId: z.number().int().positive(),
  communityType: z.enum(COMMUNITY_TYPES),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsedCommunityId = communityIdQuerySchema.safeParse(searchParams.get('communityId'));

  if (!parsedCommunityId.success) {
    throw new ValidationError('Invalid or missing communityId query parameter', {
      fields: formatZodErrors(parsedCommunityId.error),
    });
  }

  const communityId = parsedCommunityId.data;
  const scoped = createScopedClient(communityId);

  const rows = await scoped.query(complianceChecklistItems);

  const data = rows.map((row) => {
    const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
    const documentPostedAt = row['documentPostedAt']
      ? new Date(row['documentPostedAt'] as string)
      : null;

    const rollingWindowRecord = row['rollingWindow'] as Record<string, unknown> | null;
    const rollingWindowMonths =
      typeof rollingWindowRecord?.months === 'number'
        ? rollingWindowRecord.months
        : null;

    return {
      ...row,
      status: calculateComplianceStatus({
        documentId: (row['documentId'] as number | null) ?? null,
        documentPostedAt,
        deadline,
        rollingWindowMonths,
      }),
    };
  });

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const body: unknown = await req.json();
  const parsedBody = generateChecklistSchema.safeParse(body);

  if (!parsedBody.success) {
    throw new ValidationError('Invalid compliance generation payload', {
      fields: formatZodErrors(parsedBody.error),
    });
  }

  const { communityId, communityType } = parsedBody.data;
  await requireCommunityMembership(communityId, userId);
  const scoped = createScopedClient(communityId);

  // Guard: ensure community exists in current tenant context.
  const communityRows = await scoped.query(communities);
  const targetCommunity = communityRows.find((row) => row['id'] === communityId);
  if (!targetCommunity) {
    throw new ValidationError(`Community ${communityId} not found`);
  }

  if (communityType === 'apartment') {
    return NextResponse.json({ data: [] }, { status: 201 });
  }

  const existing = await scoped.query(complianceChecklistItems);
  if (existing.length > 0) {
    return NextResponse.json({ data: existing, meta: { alreadyGenerated: true } });
  }

  const template = getComplianceTemplate(communityType as CommunityType);
  const inserted: Record<string, unknown>[] = [];
  const now = new Date();

  for (const item of template) {
    const rows = await scoped.insert(complianceChecklistItems, {
      templateKey: item.templateKey,
      title: item.title,
      description: item.description,
      category: item.category,
      statuteReference: item.statuteReference,
      deadline: item.deadlineDays ? calculatePostingDeadline(now, item.deadlineDays) : null,
      rollingWindow: item.rollingMonths ? { months: item.rollingMonths } : null,
      documentId: null,
      documentPostedAt: null,
      lastModifiedBy: userId,
    });

    if (rows[0]) {
      inserted.push(rows[0]);
    }
  }

  await logAuditEvent({
    userId,
    action: 'create',
    resourceType: 'compliance_checklist',
    resourceId: String(communityId),
    communityId,
    newValues: {
      communityType,
      itemCount: inserted.length,
      templateKeys: template.map((item) => item.templateKey),
    },
  });

  return NextResponse.json({ data: inserted }, { status: 201 });
});
