/**
 * Anonymous download of a document an association has put on its public site.
 *
 * ## Why this route exists at all
 *
 * `documents.public_access` has been readable since migration 0007 — the public
 * site's documents block and the sitemap both filter on it — but the only
 * download endpoint required a session AND community membership, and the
 * `documents` bucket is private. So a "public" document was listed on a public
 * page behind a link that bounced anonymous visitors to the login screen. The
 * sitemap's own docblock recorded the gap and named this route as future work.
 *
 * §718.111(12)(g) is the duty it serves: a condo of 25+ units must post its
 * official records on a website.
 *
 * ## Why it is a separate route, not a branch in the authenticated one
 *
 * This is the ONLY unauthenticated read of the private documents bucket in the
 * product. Two auth modes in one handler is exactly where that kind of thing
 * goes wrong; keeping it separate means the authenticated route keeps its
 * single, unconditional gate, and this route has exactly one rule —
 * `getPublicDocumentFile` returns a row only when it is public, not deleted, in
 * the named community, and that community is not itself soft-deleted.
 *
 * That last predicate is this route's alone to enforce. `communityId` arrives
 * on the query string, so unlike every other public surface the request never
 * passes the middleware RPC (`pp_public_community_id_by_slug`, migration 0045)
 * that filters out soft-deleted communities.
 *
 * ## No audit entry, deliberately
 *
 * `compliance_audit_log` is append-only, permanent and board-readable. Writing a
 * row per anonymous internet request would bloat it without recording anything
 * accountable — the accountable act is PUBLISHING, which the PATCH on
 * `/api/v1/documents` audits with actor and timestamp.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createPresignedDownloadUrl } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

/** Short-lived: the link is handed to an anonymous browser. */
const SIGNED_URL_TTL_SECONDS = 300;

export const GET = withErrorHandler(async (req: NextRequest, context) => {
  if (!context?.params) {
    throw new ValidationError('Missing route parameters');
  }

  const { id: idParam } = await context.params;
  const documentId = Number(idParam);

  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new ValidationError('Invalid document ID');
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const reader = getPublicCommunityScopedReader(parsed.data.communityId);
  const document = await reader.getPublicDocumentFile(documentId);

  // Deliberately the same 404 whether the document is private, deleted, or in
  // another community — a distinguishable response would let an anonymous
  // caller enumerate which ids exist.
  if (!document) {
    throw new NotFoundError('Document not found');
  }

  let signedUrl: string;
  try {
    signedUrl = await createPresignedDownloadUrl(
      'documents',
      document.filePath,
      SIGNED_URL_TTL_SECONDS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('object not found')) {
      throw new AppError('Document file is missing from storage', 500, 'DOCUMENT_FILE_MISSING');
    }
    throw new AppError(
      'Document storage is temporarily unavailable',
      503,
      'DOCUMENT_STORAGE_UNAVAILABLE',
    );
  }

  // A redirect, not JSON: this URL is reached by a person clicking Download on
  // the association's public site, not by a fetch that can unwrap an envelope.
  return NextResponse.redirect(signedUrl);
});
