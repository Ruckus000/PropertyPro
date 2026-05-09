/**
 * Publish a document draft.
 *
 * Renders the editor's HTML to PDF via headless Chromium, archives the PDF
 * and source HTML side-by-side in the documents bucket, inserts a normal
 * documents row with source_type='authored', links the parent in the
 * version chain when this is a re-edit, links to the meeting (when seeded
 * from one), audit-logs, soft-deletes the draft, and returns the new
 * documents row id.
 *
 * Failure is atomic at the documents-row layer: storage uploads happen
 * BEFORE the row insert (idempotent paths), so a failed insert leaves
 * orphan storage objects but no dangling row. A retry replaces them at the
 * same paths and inserts cleanly.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent, createPresignedDownloadUrl } from '@propertypro/db';
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
import { renderAuthoredHtml } from '@/lib/documents/render-authored-html';
import { renderHtmlToPdf } from '@/lib/documents/render-pdf';
import { createAuthoredDocument } from '@/lib/documents/create-authored-document';
import {
  getAuthorDisplayName,
  getCommunityForDocumentPublish,
  getDocumentDraftById,
  getMeetingForDraftSeed,
  linkPublishedDocumentToMeeting,
  softDeleteDocumentDraft,
} from '@/lib/services/document-draft-service';

// Chromium needs a real Node runtime, more memory, and a longer timeout.
export const runtime = 'nodejs';
export const maxDuration = 60;

const querySchema = z.object({ communityId: z.coerce.number().int().positive() });

interface LetterheadOptions {
  header?: boolean;
  footer?: boolean;
}

function parseDraftId(rawId: string): number {
  const n = Number(rawId);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('draft id must be positive integer');
  return n;
}

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const draftId = parseDraftId(rawId);

    const { searchParams } = new URL(req.url);
    const parsedQuery = querySchema.safeParse({
      communityId: searchParams.get('communityId') ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new ValidationError('communityId required', {
        fields: formatZodErrors(parsedQuery.error),
      });
    }
    const communityId = resolveEffectiveCommunityId(req, parsedQuery.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    // 1. Load draft.
    const draft = await getDocumentDraftById(communityId, draftId);
    if (!draft || draft['deletedAt']) throw new NotFoundError('Draft not found');
    const isAuthor = draft['authorId'] === userId;
    if (!isAuthor && !membership.isAdmin) {
      throw new ForbiddenError('Not authorized to publish this draft');
    }

    const title = String(draft['title'] ?? 'Untitled');
    const targetCategoryId = draft['targetCategoryId'] != null
      ? Number(draft['targetCategoryId'])
      : null;
    const sourceDocumentId = draft['sourceDocumentId'] != null
      ? Number(draft['sourceDocumentId'])
      : null;
    const targetMeetingId = draft['targetMeetingId'] != null
      ? Number(draft['targetMeetingId'])
      : null;
    const coverSheetEnabled = Boolean(draft['coverSheetEnabled']);
    const letterhead = (draft['letterheadOptions'] ?? {}) as LetterheadOptions;
    const rawBodyHtml = String(draft['bodyHtml'] ?? '');

    if (rawBodyHtml.trim().length === 0) {
      throw new ValidationError('Cannot publish an empty document');
    }

    // 2. Sanitize once more on the server.
    const safeBody = sanitizeAuthoredHtml(rawBodyHtml);

    // Resolve community + author display data for the print template.
    const [community, author] = await Promise.all([
      getCommunityForDocumentPublish(communityId),
      getAuthorDisplayName(communityId, String(draft['authorId'])),
    ]);
    if (!community) throw new NotFoundError('Community record not found');

    const communityName = String(community.name ?? '');
    const logoPath = (community.branding?.logoPath ?? community.logoPath ?? null) as string | null;
    let communityLogoUrl: string | null = null;
    if (logoPath) {
      try {
        communityLogoUrl = await createPresignedDownloadUrl('documents', logoPath, 60 * 60);
      } catch {
        // Non-fatal — render without logo if it can't be resolved.
        communityLogoUrl = null;
      }
    }

    // NOTE: pre-A3-drain-#49 the route read author.firstName / author.lastName
    // — fields that don't exist on the users schema (only fullName does), so
    // authorName was always null. The drain fixed this by switching to
    // `getAuthorDisplayName` which projects users.fullName.
    const authorName = author?.fullName?.trim() || null;

    // 3. Build print HTML.
    const generatedAt = new Date();
    const printHtml = renderAuthoredHtml({
      bodyHtml: safeBody,
      title,
      communityName,
      communityLogoUrl,
      authorName,
      generatedAt,
      coverSheetEnabled,
      letterhead,
    });

    // 4. Render PDF via Chromium. Hard 45s ceiling under the 60s function limit.
    const pdfBytes = await renderHtmlToPdf({ html: printHtml, timeoutMs: 45_000 });

    // 5+6. Upload artifacts and insert the documents row via the helper.
    // Resolve the parent of the new published document. If this is a
    // re-edit, the parent is the source document; the chain root stays
    // the original publish.
    const parentDocumentId = sourceDocumentId;

    const htmlBytes = new TextEncoder().encode(printHtml);

    const result = await createAuthoredDocument({
      userId,
      communityId,
      title,
      categoryId: targetCategoryId,
      parentDocumentId,
      pdfBytes,
      htmlBytes,
    });

    const documentId = Number((result.document as Record<string, unknown>)['id']);

    // 7. Link the published doc to the meeting it was authored from.
    if (targetMeetingId != null) {
      const meeting = await getMeetingForDraftSeed(communityId, targetMeetingId);
      if (meeting) {
        try {
          await linkPublishedDocumentToMeeting(communityId, targetMeetingId, documentId);
        } catch (err) {
          // Non-fatal: the publish succeeded, the link can be added later.
          // eslint-disable-next-line no-console
          console.error('[publish] failed to link meeting document', {
            meetingId: targetMeetingId,
            documentId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // 8. Audit (compliance is automatic via documents-row insert; the
    //    rolling-window calculator picks it up by category).
    await logAuditEvent({
      userId,
      action: 'create',
      resourceType: 'authored_document',
      resourceId: String(documentId),
      communityId,
      newValues: {
        draftId,
        title,
        categoryId: targetCategoryId,
        meetingId: targetMeetingId,
        parentDocumentId,
      },
      metadata: {
        coverSheetEnabled,
        letterheadHeader: letterhead.header !== false,
        letterheadFooter: letterhead.footer !== false,
      },
    });

    // 9. Soft-delete the draft.
    await softDeleteDocumentDraft(communityId, draftId);

    return NextResponse.json(
      {
        data: {
          documentId,
          warnings: result.warnings.length > 0 ? result.warnings : undefined,
        },
      },
      { status: 201 },
    );
  },
);
