import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireNoticePdfEnabled,
  requireViolationAdminWrite,
  requireViolationsEnabled,
} from '@/lib/violations/common';
import {
  getViolationForCommunity,
  getViolationNoticeCommunityHeader,
} from '@/lib/services/violations-service';
import { getUnitLabelMap } from '@/lib/services/units-lookup';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';
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
    await requireActiveSubscriptionForMutation(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    // Legal gate — generated notices ship disabled. This PDF states legal
    // conclusions and names the Board as imposing the fine where the statute
    // requires a fining committee. See docs/audits/2026-08-09-legal-risk-audit.md F-05.
    requireNoticePdfEnabled(membership);
    requireViolationAdminWrite(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const violation = await getViolationForCommunity(communityId, id);

    // Get community details for the notice header. Pre-A3 the violation-notice
    // path silently fell back to defaults when the row was missing; preserve
    // that behavior by ignoring `header.found` here.
    const header = await getViolationNoticeCommunityHeader(communityId);

    // Today in the community, not in UTC: after 8pm Eastern the UTC date is
    // tomorrow's.
    const noticeDate = violation.noticeDate
      ?? utcDateToWallClockValue(new Date(), header.timeZone).slice(0, 10);
    // The unit NUMBER an owner recognises; notices printed the database id until
    // 2026-09-30 ("Unit: 17" for unit 204). A unit since removed (the lookup is
    // scoped, so soft-deleted rows are excluded) says so rather than print an id
    // that reads as a unit number.
    const unitLabels = await getUnitLabelMap(communityId, [violation.unitId]);
    const unitNumber = unitLabels.get(violation.unitId) ?? `#${violation.unitId} (unit removed)`;

    const pdfBytes = generateViolationNoticePdf({
      violationId: violation.id,
      communityName: header.name,
      communityAddress: header.address,
      unitNumber,
      ownerName: null, // Owner name resolution deferred — would require user join
      category: violation.category,
      description: violation.description,
      severity: violation.severity,
      reportedDate: violation.createdAt,
      noticeDate,
      timeZone: header.timeZone,
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

