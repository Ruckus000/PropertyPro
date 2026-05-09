import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireViolationAdminWrite,
  requireViolationsEnabled,
} from '@/lib/violations/common';
import {
  getViolationForCommunity,
  getViolationNoticeCommunityHeader,
} from '@/lib/services/violations-service';
import { generateHearingNoticePdf } from '@/lib/utils/violation-notice-pdf';

/**
 * GET /api/v1/violations/:id/hearing-notice?communityId=X
 * Downloads a PDF hearing notice for the given violation.
 * Requires admin role and that a hearing date is set.
 */
export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'violation id');
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requireViolationAdminWrite(membership);

    const violation = await getViolationForCommunity(communityId, id);

    if (!violation.hearingDate) {
      throw new ValidationError('No hearing date set for this violation');
    }

    // Get community details for the notice header. Hearing-notice path is
    // strict: throws NotFoundError when the community row is missing
    // (matches pre-A3 behavior — the violation-notice path was lenient).
    const header = await getViolationNoticeCommunityHeader(communityId);
    if (!header.found) {
      throw new NotFoundError('Community not found');
    }

    const noticeDate = new Date().toISOString().slice(0, 10);

    const pdfBytes = generateHearingNoticePdf({
      violationId: violation.id,
      communityName: header.name,
      communityAddress: header.address,
      unitNumber: String(violation.unitId),
      ownerName: null,
      category: violation.category,
      description: violation.description,
      hearingDate: violation.hearingDate,
      hearingLocation: null, // Location not stored on violation record currently
      noticeDate,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="violation-${id}-hearing-notice.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  },
);
