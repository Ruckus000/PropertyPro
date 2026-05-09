/**
 * Draft detail — GET (load + soft-lock metadata), PATCH (autosave), DELETE
 * (soft-delete / cancel). Authors can read/edit their own drafts; admins
 * can read/edit any draft in their community to support take-over UX.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { sanitizeAuthoredHtml } from '@/lib/utils/sanitize-authored-html';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getDocumentDraftById,
  softDeleteDocumentDraft,
  updateDocumentDraft,
} from '@/lib/services/document-draft-service';

export const runtime = 'nodejs';

const querySchema = z.object({ communityId: z.coerce.number().int().positive() });

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().max(2_000_000).optional(),
  targetCategoryId: z.number().int().positive().nullable().optional(),
  coverSheetEnabled: z.boolean().optional(),
  letterheadOptions: z
    .object({ header: z.boolean().optional(), footer: z.boolean().optional() })
    .optional(),
});

function parseDraftId(rawId: string): number {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('draft id must be a positive integer');
  }
  return id;
}

function getCommunityIdFromQuery(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ communityId: searchParams.get('communityId') ?? undefined });
  if (!parsed.success) {
    throw new ValidationError('communityId required', { fields: formatZodErrors(parsed.error) });
  }
  return parsed.data.communityId;
}

function ensureCanAccessDraft(
  draft: Record<string, unknown>,
  userId: string,
  membership: { isAdmin: boolean },
): void {
  const isAuthor = draft['authorId'] === userId;
  if (isAuthor) return;
  if (membership.isAdmin) return;
  throw new ForbiddenError('Not authorized to access this draft');
}

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const draftId = parseDraftId(rawId);
    const communityId = resolveEffectiveCommunityId(req, getCommunityIdFromQuery(req));
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    const draft = await getDocumentDraftById(communityId, draftId);
    if (!draft || draft['deletedAt']) throw new NotFoundError('Draft not found');
    ensureCanAccessDraft(draft, userId, membership);

    return NextResponse.json({ data: draft });
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const draftId = parseDraftId(rawId);
    const body: unknown = await req.json();
    const parseResult = patchSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid draft patch', {
        fields: formatZodErrors(parseResult.error),
      });
    }
    const data = parseResult.data;

    const communityId = resolveEffectiveCommunityId(req, getCommunityIdFromQuery(req));
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    const existing = await getDocumentDraftById(communityId, draftId);
    if (!existing || existing['deletedAt']) throw new NotFoundError('Draft not found');
    ensureCanAccessDraft(existing, userId, membership);

    const update: Record<string, unknown> = {
      lastEditorId: userId,
      lastEditedAt: new Date(),
    };
    if (data.title !== undefined) update['title'] = data.title;
    if (data.bodyHtml !== undefined) update['bodyHtml'] = sanitizeAuthoredHtml(data.bodyHtml);
    if (data.targetCategoryId !== undefined) update['targetCategoryId'] = data.targetCategoryId;
    if (data.coverSheetEnabled !== undefined) update['coverSheetEnabled'] = data.coverSheetEnabled;
    if (data.letterheadOptions !== undefined) {
      update['letterheadOptions'] = data.letterheadOptions;
    }

    const updatedRows = await updateDocumentDraft(communityId, draftId, update);

    return NextResponse.json({ data: updatedRows[0] ?? existing });
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const draftId = parseDraftId(rawId);
    const communityId = resolveEffectiveCommunityId(req, getCommunityIdFromQuery(req));
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    const existing = await getDocumentDraftById(communityId, draftId);
    if (!existing || existing['deletedAt']) throw new NotFoundError('Draft not found');
    ensureCanAccessDraft(existing, userId, membership);

    await softDeleteDocumentDraft(communityId, draftId);

    await logAuditEvent({
      userId,
      action: 'delete',
      resourceType: 'document_draft',
      resourceId: String(draftId),
      communityId,
    });

    return NextResponse.json({ data: { id: draftId, deleted: true } });
  },
);
