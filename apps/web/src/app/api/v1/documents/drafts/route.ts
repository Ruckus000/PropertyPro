/**
 * Document drafts collection — POST creates a new draft (optionally seeded
 * from a meeting or a previously-published authored document for re-edit);
 * GET lists the calling user's drafts within a community.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  documentDrafts,
  documents,
  meetings,
  logAuditEvent,
} from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { sanitizeAuthoredHtml } from '@/lib/utils/sanitize-authored-html';

export const runtime = 'nodejs';

const createDraftSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500).optional(),
  targetCategoryId: z.number().int().positive().nullable().optional(),
  targetMeetingId: z.number().int().positive().nullable().optional(),
  /** When set, draft is seeded from a previously-published authored document. */
  sourceDocumentId: z.number().int().positive().nullable().optional(),
  initialBodyHtml: z.string().max(2_000_000).optional(),
});

const listQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const parseResult = listQuerySchema.safeParse({
    communityId: searchParams.get('communityId') ?? undefined,
  });
  if (!parseResult.success) {
    throw new ValidationError('Invalid query', { fields: formatZodErrors(parseResult.error) });
  }
  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'documents', 'write');

  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documentDrafts,
    {},
    and(eq(documentDrafts.authorId, userId), isNull(documentDrafts.deletedAt)),
  )) as unknown as Array<Record<string, unknown>>;

  // Sort newest-edited first; small lists, sorting in JS is cheaper than
  // adding a dynamic builder dance.
  rows.sort((a, b) => {
    const av = new Date(String(a['lastEditedAt'] ?? a['updatedAt'] ?? 0)).getTime();
    const bv = new Date(String(b['lastEditedAt'] ?? b['updatedAt'] ?? 0)).getTime();
    return bv - av;
  });

  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createDraftSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid draft payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }
  const data = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'documents', 'write');
  await requireActiveSubscriptionForMutation(communityId);

  const scoped = createScopedClient(communityId);

  // Validate cross-table references stay within this community.
  let title = data.title ?? 'Untitled';
  let initialBody = data.initialBodyHtml ? sanitizeAuthoredHtml(data.initialBodyHtml) : '';

  if (data.targetMeetingId != null) {
    const meetingRows = (await scoped.selectFrom(
      meetings,
      {},
      eq(meetings.id, data.targetMeetingId),
    )) as unknown as Array<Record<string, unknown>>;
    const meeting = meetingRows[0];
    if (!meeting) throw new NotFoundError('Meeting not found in this community');
    if (!data.title) {
      const start = meeting['startsAt'] instanceof Date
        ? meeting['startsAt']
        : new Date(String(meeting['startsAt'] ?? Date.now()));
      const dateLabel = start.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      title = `Minutes — ${String(meeting['title'] ?? 'Meeting')} — ${dateLabel}`;
    }
  }

  if (data.sourceDocumentId != null) {
    // Re-edit flow: confirm the source document is in this community and is
    // an authored document. Body is loaded by the editor via a separate
    // round-trip from storage (the helper that performs that lives in PR 4).
    const docRows = (await scoped.selectFrom(
      documents,
      {},
      eq(documents.id, data.sourceDocumentId),
    )) as unknown as Array<Record<string, unknown>>;
    const doc = docRows[0];
    if (!doc) throw new NotFoundError('Source document not found in this community');
    if (doc['sourceType'] !== 'authored') {
      throw new ValidationError('Only authored documents can be re-edited');
    }
    if (!data.title) {
      title = String(doc['title'] ?? 'Untitled');
    }
  }

  const insertedRows = (await scoped.insert(documentDrafts, {
    authorId: userId,
    title,
    bodyHtml: initialBody,
    targetCategoryId: data.targetCategoryId ?? null,
    targetMeetingId: data.targetMeetingId ?? null,
    sourceDocumentId: data.sourceDocumentId ?? null,
    lastEditorId: userId,
    lastEditedAt: new Date(),
  })) as unknown as Array<Record<string, unknown>>;

  const created = insertedRows[0];
  if (!created) {
    throw new ForbiddenError('Failed to create draft');
  }

  await logAuditEvent({
    userId,
    action: 'create',
    resourceType: 'document_draft',
    resourceId: String(created['id']),
    communityId,
    newValues: {
      title,
      targetCategoryId: data.targetCategoryId ?? null,
      targetMeetingId: data.targetMeetingId ?? null,
      sourceDocumentId: data.sourceDocumentId ?? null,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
});
