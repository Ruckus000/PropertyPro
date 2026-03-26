import { NextResponse, type NextRequest } from 'next/server';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireViolationAdminWrite,
  requireViolationsEnabled,
} from '@/lib/violations/common';
import { getViolationForCommunity } from '@/lib/services/violations-service';
import { generateViolationNoticePdf } from '@/lib/utils/violation-notice-pdf';

/**
 * GET /api/v1/violations/:id/notice?communityId=X
 * Downloads a PDF violation notice for the given violation.
 * Requires admin role.
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

    // Get community details for the notice header
    const scoped = createScopedClient(communityId);
    const communityRows = await scoped.selectFrom(
      communities,
      {},
      eq(communities.id, communityId),
    );
    const community = (communityRows as unknown as Record<string, unknown>[])[0];

    const communityName = (community?.name as string) ?? 'Community Association';
    const addressParts = [
      community?.addressLine1 as string,
      community?.city as string,
      community?.state as string,
      community?.zipCode as string,
    ].filter(Boolean);
    const communityAddress = addressParts.length > 0
      ? addressParts.join(', ')
      : '';

    const noticeDate = violation.noticeDate
      ?? new Date().toISOString().slice(0, 10);

    const pdfBytes = generateViolationNoticePdf({
      violationId: violation.id,
      communityName,
      communityAddress,
      unitNumber: String(violation.unitId),
      ownerName: null, // Owner name resolution deferred — would require user join
      category: violation.category,
      description: violation.description,
      severity: violation.severity,
      reportedDate: violation.createdAt,
      noticeDate,
      hearingDate: violation.hearingDate,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="violation-${id}-notice.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  },
);
