/**
 * Calendar — community calendar events
 *
 * GET /api/v1/calendar/events?communityId=N&start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Plan A1 bundle drain #35. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId ?? null)  // header fallback
 *   → requireCommunityMembership
 *   → requirePermission('meetings', 'read')
 *   → parseRequiredCalendarDateRange (sync; throws BadRequestError on missing/bad dates)
 *   → listCommunityCalendarMeetings + (optional) assessment-due records
 *
 * `communityId` may come from either the query or the `x-community-id`
 * header (drain #10 lesson — `resolveEffectiveCommunityId(req, null)`
 * falls back to the header). The contract permits `communityId?` for
 * exactly this reason.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `communityId`
 * shifts to the canonical `VALIDATION_ERROR` envelope. Missing or invalid
 * `start`/`end` continue to throw BadRequestError from
 * `parseRequiredCalendarDateRange` — unchanged. Success wire shape
 * `{ data: events[] }` byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { parseRequiredCalendarDateRange } from '@/lib/calendar/date-range';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import {
  listAggregateAssessmentDueRecords,
  listCommunityCalendarMeetings,
  listOwnerAssessmentDueRecords,
} from '@/lib/services/calendar-data-service';
import { calendarEventsGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(calendarEventsGetContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
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

    return events;
  }),
);
