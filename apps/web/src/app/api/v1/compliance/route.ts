import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  complianceChecklistItems,
  createScopedClient,
  logAuditEvent,
} from '@propertypro/db';
import {
  getComplianceTemplate,
  getFeaturesForCommunity,
  type CommunityType,
} from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  calculateComplianceStatus,
  calculatePostingDeadline,
} from '@/lib/utils/compliance-calculator';

const communityIdQuerySchema = z.coerce.number().int().positive();

const generateChecklistSchema = z
  .object({
    communityId: z.number().int().positive(),
  })
  .strict();

/**
 * Feature gate: Require condo/HOA community for compliance features
 */
function requireCondoCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasCompliance) {
    throw new ForbiddenError('Compliance features are only available for condo/HOA communities');
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === '23505';
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const parsedCommunityId = communityIdQuerySchema.safeParse(searchParams.get('communityId'));

  if (!parsedCommunityId.success) {
    throw new ValidationError('Invalid or missing communityId query parameter', {
      fields: formatZodErrors(parsedCommunityId.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId.data);
  const membership = await requireCommunityMembership(communityId, userId);
  requireCondoCommunity(membership.communityType);

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

  const communityId = resolveEffectiveCommunityId(req, parsedBody.data.communityId);
  const membership = await requireCommunityMembership(communityId, userId);

  // Feature gate: compliance is only available for condo/HOA communities
  requireCondoCommunity(membership.communityType);

  const scoped = createScopedClient(communityId);

  const existing = await scoped.query(complianceChecklistItems);
  if (existing.length > 0) {
    return NextResponse.json({ data: existing, meta: { alreadyGenerated: true } });
  }

  const template = getComplianceTemplate(membership.communityType);
  const now = new Date();
  const rows = template.map((item) => ({
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
  }));

  try {
    await scoped.insert(complianceChecklistItems, rows);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const raced = await scoped.query(complianceChecklistItems);
    return NextResponse.json({ data: raced, meta: { alreadyGenerated: true } });
  }

  const inserted = await scoped.query(complianceChecklistItems);

  await logAuditEvent({
    userId,
    action: 'create',
    resourceType: 'compliance_checklist',
    resourceId: String(communityId),
    communityId,
    newValues: {
      communityType: membership.communityType,
      itemCount: inserted.length,
      templateKeys: template.map((item) => item.templateKey),
    },
  });

  return NextResponse.json({ data: inserted }, { status: 201 });
});
