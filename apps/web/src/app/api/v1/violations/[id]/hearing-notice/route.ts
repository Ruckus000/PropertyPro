import { NextResponse, type NextRequest } from 'next/server';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireViolationAdminWrite,
  requireViolationsEnabled,
} from '@/lib/violations/common';
import { getViolationForCommunity } from '@/lib/services/violations-service';
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
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireViolationsEnabled(membership);
    requireViolationAdminWrite(membership);

    const violation = await getViolationForCommunity(communityId, id);

    if (!violation.hearingDate) {
      throw new ValidationError('No hearing date set for this violation');
    }

    // Get community details for the notice header
    const scoped = createScopedClient(communityId);
    const communityRows = await scoped.selectFrom(
      communities,
      {},
      eq(communities.id, communityId),
    );
    const community = (communityRows as unknown as Record<string, unknown>[])[0];

    if (!community) {
      throw new NotFoundError('Community not found');
    }

    const communityName = (community.name as string) ?? 'Community Association';
    const addressParts = [
      community.addressLine1 as string,
      community.city as string,
      community.state as string,
      community.zipCode as string,
    ].filter(Boolean);
    const communityAddress = addressParts.length > 0
      ? addressParts.join(', ')
      : '';

    const noticeDate = new Date().toISOString().slice(0, 10);

    const pdfBytes = generateHearingNoticePdf({
      violationId: violation.id,
      communityName,
      communityAddress,
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
