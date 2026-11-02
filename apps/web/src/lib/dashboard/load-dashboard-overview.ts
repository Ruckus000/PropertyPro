import { createScopedClient } from '@propertypro/db';
import type { CommunityFeatures } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';
import type { CommunityMembership } from '@/lib/api/community-membership';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { loadChecklistWithStatus } from '@/lib/compliance/load-checklist-with-status';
import { canActAsBoard, checkPermissionV2 } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  listCommunityCalendarMeetings,
  type CalendarMeetingRecord,
} from '@/lib/services/calendar-data-service';
import { dateOnlyInTimeZone, dateOnlyRangeToUtcBounds } from '@/lib/utils/zoned-datetime';
import { getViolationReadUnitIds } from '@/lib/violations/common';
import { listDashboardUpcomingHearings } from './dashboard-queries';

export type Loaded<T> = { ok: true; value: T } | { ok: false };

export interface DashboardHearing {
  violationId: number;
  unitLabel: string;
  /** ISO timestamp. */
  hearingDate: string;
}

export interface DashboardOverviewData {
  /** null = not loaded for this audience or plan (D10, D11). */
  checklist: Loaded<ChecklistItemData[]> | null;
  /** [today 00:00 in the community timezone, +30 days). */
  meetings30d: Loaded<CalendarMeetingRecord[]>;
  /** null = no board or manager seat, or the plan has no violations. */
  hearings: Loaded<DashboardHearing[]> | null;
}

const MEETING_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** `date` ('YYYY-MM-DD') plus whole days, by UTC calendar arithmetic (no DST). */
function addDateOnlyDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** A source resolves to its value, or null when it is not loaded for this viewer. */
function settle<T>(source: string, result: PromiseSettledResult<T | null>): Loaded<T> | null {
  if (result.status === 'fulfilled') {
    return result.value === null ? null : { ok: true, value: result.value };
  }
  console.error('[dashboard-overview]', source, result.reason);
  return { ok: false };
}

/**
 * The extra reads behind the redesigned dashboard (D3: `loadDashboardData` is
 * untouched). Each source settles on its own (D21): one failing read becomes
 * `{ ok: false }` and the rest still render. Owners and tenants pay for the
 * meetings read only (D11).
 */
export async function loadDashboardOverview(args: {
  communityId: number;
  userId: string;
  membership: CommunityMembership;
  features: CommunityFeatures;
  timeZone: string;
  now: Date;
}): Promise<DashboardOverviewData> {
  const { communityId, userId, membership, features, timeZone, now } = args;
  const board = canActAsBoard(membership);

  const loadChecklist = async (): Promise<ChecklistItemData[] | null> => {
    if (
      !board ||
      !features.hasCompliance ||
      !checkPermissionV2(membership.role, membership.communityType, 'compliance', 'read', {
        isUnitOwner: membership.isUnitOwner,
      })
    ) {
      return null;
    }
    try {
      await requireEntitledForAdminRead(communityId, membership);
    } catch (error) {
      // A lapsed subscription hides the checklist; a failed lookup is a failed source.
      if (error instanceof AppError && error.code === 'SUBSCRIPTION_REQUIRED') return null;
      throw error;
    }
    const rows = await loadChecklistWithStatus(communityId, membership.communityType);
    return rows as unknown as ChecklistItemData[];
  };

  const loadMeetings = async (): Promise<CalendarMeetingRecord[]> => {
    const today = dateOnlyInTimeZone(now, timeZone);
    // The bounds helper treats `end` as inclusive: 30 days from today is today + 29.
    return listCommunityCalendarMeetings(
      communityId,
      dateOnlyRangeToUtcBounds(today, addDateOnlyDays(today, MEETING_WINDOW_DAYS - 1), timeZone),
    );
  };

  const loadHearings = async (): Promise<DashboardHearing[] | null> => {
    if (!board || !features.hasViolations) return null;
    const scoped = createScopedClient(communityId);
    const unitIds = await getViolationReadUnitIds(scoped, membership, userId);
    return listDashboardUpcomingHearings(scoped, unitIds ?? null, now);
  };

  const [checklist, meetings, hearings] = await Promise.allSettled([
    loadChecklist(),
    loadMeetings(),
    loadHearings(),
  ]);

  return {
    checklist: settle('checklist', checklist),
    // loadMeetings never resolves null, so settle() always returns a Loaded here.
    meetings30d: settle('meetings30d', meetings) ?? { ok: false },
    hearings: settle('hearings', hearings),
  };
}
