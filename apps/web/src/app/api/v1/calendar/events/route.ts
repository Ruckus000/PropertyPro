import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseRequiredCalendarDateRange } from '@/lib/calendar/date-range';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { parseCommunityIdFromQueryOrHeader } from '@/lib/calendar/request';
import {
  listAggregateAssessmentDueRecords,
  listCommunityCalendarMeetings,
  listOwnerAssessmentDueRecords,
} from '@/lib/services/calendar-data-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQueryOrHeader(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'meetings', 'read');

  const { searchParams } = new URL(req.url);
  const range = parseRequiredCalendarDateRange(searchParams, membership.timezone);

  const meetingRows = await listCommunityCalendarMeetings(communityId, {
    startUtc: range.startUtc,
    endUtcExclusive: range.endUtcExclusive,
  });

  const events: Array<Record<string, unknown>> = meetingRows.map((meeting) => ({
    type: 'meeting',
    id: meeting.id,
    title: meeting.title,
    meetingType: meeting.meetingType,
    startsAt: meeting.startsAt.toISOString(),
    endsAt: meeting.endsAt?.toISOString() ?? null,
    location: meeting.location,
  }));

  const canReadFinances = checkPermissionV2(
    membership.role,
    membership.communityType,
    'finances',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
  );

  if (canReadFinances) {
    if (membership.isAdmin) {
      const assessmentRows = await listAggregateAssessmentDueRecords(communityId, {
        start: range.start,
        end: range.end,
      });
      events.push(
        ...assessmentRows.map((assessment) => ({
          type: 'assessment_due',
          dueDate: assessment.dueDate,
          assessmentTitle: assessment.assessmentTitle,
          assessmentId: assessment.assessmentId,
          unitCount: assessment.unitCount,
          pendingCount: assessment.pendingCount,
          totalAmountCents: assessment.totalAmountCents,
        })),
      );
    } else if (membership.role === 'resident' && membership.isUnitOwner) {
      const assessmentRows = await listOwnerAssessmentDueRecords(
        communityId,
        actorUserId,
        {
          start: range.start,
          end: range.end,
        },
      );
      events.push(
        ...assessmentRows.map((assessment) => ({
          type: 'my_assessment_due',
          dueDate: assessment.dueDate,
          assessmentTitle: assessment.assessmentTitle,
          assessmentId: assessment.assessmentId,
          amountCents: assessment.amountCents,
          status: assessment.status,
          unitLabel: assessment.unitLabel,
        })),
      );
    }
  }

  events.sort((left, right) => {
    const leftKey = String(
      left.type === 'meeting' ? left.startsAt : left.dueDate,
    );
    const rightKey = String(
      right.type === 'meeting' ? right.startsAt : right.dueDate,
    );
    return leftKey.localeCompare(rightKey);
  });

  return NextResponse.json({ data: events });
});
