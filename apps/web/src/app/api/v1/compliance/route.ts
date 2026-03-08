import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  complianceChecklistItems,
  documents,
  createScopedClient,
  logAuditEvent,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
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
import { requirePermission } from '@/lib/db/access-control';
import {
  calculateComplianceStatus,
  calculatePostingDeadline,
} from '@/lib/utils/compliance-calculator';

const communityIdQuerySchema = z.coerce.number().int().positive();

/** Enrich a raw checklist row with a computed compliance status. */
function enrichRowWithStatus(row: Record<string, unknown>) {
  const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
  const documentPostedAt = row['documentPostedAt']
    ? new Date(row['documentPostedAt'] as string)
    : null;
  const rollingWindowRecord = row['rollingWindow'] as Record<string, unknown> | null;
  const rollingWindowMonths =
    typeof rollingWindowRecord?.months === 'number' ? rollingWindowRecord.months : null;

  return {
    ...row,
    status: calculateComplianceStatus({
      isApplicable: row['isApplicable'] as boolean | undefined,
      documentId: (row['documentId'] as number | null) ?? null,
      documentPostedAt,
      deadline,
      rollingWindowMonths,
    }),
  };
}

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
  requirePermission(membership.role, membership.communityType, 'compliance', 'read');

  const scoped = createScopedClient(communityId);

  const rows = await scoped.query(complianceChecklistItems);

  const data = rows.map(enrichRowWithStatus);

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
  requirePermission(membership.role, membership.communityType, 'compliance', 'write');

  const scoped = createScopedClient(communityId);

  const existing = await scoped.query(complianceChecklistItems);
  if (existing.length > 0) {
    return NextResponse.json({ data: existing, meta: { alreadyGenerated: true } });
  }

  const template = getComplianceTemplate(membership.communityType);
  if (template.length === 0) {
    console.warn(
      `[compliance] Empty template for community type "${membership.communityType}" despite hasCompliance=true. Skipping checklist generation.`,
    );
    return NextResponse.json({ data: [], meta: { emptyTemplate: true } });
  }

  const now = new Date();
  const rows = template.map((item) => ({
    templateKey: item.templateKey,
    title: item.title,
    description: item.description,
    category: item.category,
    statuteReference: item.statuteReference,
    deadline: item.deadlineDays ? calculatePostingDeadline(now, item.deadlineDays) : null,
    rollingWindow: item.rollingMonths ? { months: item.rollingMonths } : null,
    isConditional: item.isConditional ?? false,
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
  if (inserted.length < template.length) {
    console.warn(
      `[compliance] Expected ${template.length} checklist items for community ${communityId}, `
      + `but found ${inserted.length}. Possible data inconsistency.`,
    );
  }

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

// ---------------------------------------------------------------------------
// PATCH /api/v1/compliance — link/unlink documents, mark applicable/not-applicable
// ---------------------------------------------------------------------------

const patchSchema = z
  .object({
    id: z.number().int().positive(),
    communityId: z.number().int().positive(),
    action: z.enum([
      'link_document',
      'unlink_document',
      'mark_not_applicable',
      'mark_applicable',
    ]),
    documentId: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (d) => d.action !== 'link_document' || d.documentId != null,
    { message: 'documentId is required when action is link_document', path: ['documentId'] },
  );

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const body: unknown = await req.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid compliance patch payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { id, action: patchAction, documentId } = parsed.data;
  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requireCondoCommunity(membership.communityType);
  requirePermission(membership.role, membership.communityType, 'compliance', 'write');

  const scoped = createScopedClient(communityId);

  // Build the update payload based on the action
  let updateData: Record<string, unknown>;
  switch (patchAction) {
    case 'link_document': {
      // Verify the document belongs to this community (scoped query enforces tenant isolation)
      const docRows = await scoped.selectFrom(documents, {}, eq(documents.id, documentId!));
      if ((docRows as unknown as unknown[]).length === 0) {
        throw new ValidationError('Document not found or does not belong to this community');
      }
      updateData = {
        documentId: documentId!,
        documentPostedAt: new Date(),
        lastModifiedBy: userId,
      };
      break;
    }
    case 'unlink_document':
      updateData = {
        documentId: null,
        documentPostedAt: null,
        lastModifiedBy: userId,
      };
      break;
    case 'mark_not_applicable':
      updateData = {
        isApplicable: false,
        lastModifiedBy: userId,
      };
      break;
    case 'mark_applicable':
      updateData = {
        isApplicable: true,
        lastModifiedBy: userId,
      };
      break;
  }

  const updated = await scoped.update(
    complianceChecklistItems,
    updateData,
    eq(complianceChecklistItems.id, id),
  );

  const row = updated[0];
  if (!row) {
    throw new ValidationError('Checklist item not found or does not belong to this community');
  }

  const result = enrichRowWithStatus(row);

  await logAuditEvent({
    userId,
    action: 'update',
    resourceType: 'compliance_checklist_item',
    resourceId: String(id),
    communityId,
    newValues: { action: patchAction, documentId: documentId ?? null },
  });

  return NextResponse.json({ data: result });
});
