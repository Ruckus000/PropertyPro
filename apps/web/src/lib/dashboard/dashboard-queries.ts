import {
  announcements,
  demoSeedRegistry,
  maintenanceRequests,
  meetings,
  users,
  violations,
  type Announcement,
  type Meeting,
  type ScopedClient,
} from '@propertypro/db';
import {
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  sql,
} from '@propertypro/db/filters';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { canReadAnnouncementAudience, type AnnouncementAudience } from '@/lib/announcements/read-visibility';
import { checkPermissionV2 } from '@/lib/db/access-control';
import {
  buildViolationSummary,
  selectRecentAnnouncements,
  selectUpcomingMeetings,
  type DashboardAnnouncement,
  type DashboardMeeting,
  type DashboardViolationSummary,
} from './dashboard-selectors';

const DASHBOARD_ITEM_LIMIT = 5;
const ANNOUNCEMENT_BATCH_SIZE = 10;
const OPEN_MAINTENANCE_STATUSES = [
  'open',
  'submitted',
  'in_progress',
  'acknowledged',
] as const;

interface DashboardUserLookup extends Record<string, unknown> {
  fullName: string | null;
  email: string | null;
}

interface DashboardViolationStatusCountRow extends Record<string, unknown> {
  status: string;
  count: number;
}

interface DashboardViolationRecentRow extends Record<string, unknown> {
  id: number;
  unitId: number;
  category: string;
  status: string;
  severity: string;
  createdAt: Date;
}

function hasDemoLineage(
  membership: Pick<CommunityMembership, 'isDemo' | 'trialEndsAt' | 'demoExpiresAt'>,
): boolean {
  return Boolean(membership.isDemo || membership.trialEndsAt || membership.demoExpiresAt);
}

function normalizeAnnouncementAudience(value: unknown): AnnouncementAudience {
  if (value === 'owners_only' || value === 'board_only' || value === 'tenants_only') {
    return value;
  }

  return 'all';
}

async function listSeededAnnouncementIds(
  scoped: ScopedClient,
): Promise<Set<number> | null> {
  try {
    const rows = await scoped.selectFrom<{ entityId: string }>(
      demoSeedRegistry,
      { entityId: demoSeedRegistry.entityId },
      eq(demoSeedRegistry.entityType, 'announcement'),
    );

    return new Set(
      rows
        .map((row) => Number(row.entityId))
        .filter((value) => Number.isInteger(value) && value > 0),
    );
  } catch {
    return null;
  }
}

export async function getDashboardUserLookup(
  scoped: ScopedClient,
  userId: string,
): Promise<DashboardUserLookup> {
  const rows = await scoped
    .selectFrom<DashboardUserLookup>(
      users,
      {
        fullName: users.fullName,
        email: users.email,
      },
      eq(users.id, userId),
    )
    .limit(1);

  return {
    fullName: rows[0]?.fullName ?? null,
    email: rows[0]?.email ?? null,
  };
}

export async function listDashboardAnnouncements(
  scoped: ScopedClient,
  membership: CommunityMembership,
): Promise<DashboardAnnouncement[]> {
  const canReadAnnouncements = checkPermissionV2(
    membership.role,
    membership.communityType,
    'announcements',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
  );

  if (!canReadAnnouncements) {
    return [];
  }

  const isDemoLineageCommunity = hasDemoLineage(membership);
  const seededAnnouncementIds = isDemoLineageCommunity
    ? await listSeededAnnouncementIds(scoped)
    : null;

  if (
    isDemoLineageCommunity
    && (seededAnnouncementIds == null || seededAnnouncementIds.size === 0)
  ) {
    return [];
  }

  const visibleRows: Announcement[] = [];

  for (
    let offset = 0;
    visibleRows.length < DASHBOARD_ITEM_LIMIT;
    offset += ANNOUNCEMENT_BATCH_SIZE
  ) {
    const batch = await scoped
      .selectFrom<Announcement>(
        announcements,
        {
          id: announcements.id,
          title: announcements.title,
          body: announcements.body,
          audience: announcements.audience,
          isPinned: announcements.isPinned,
          archivedAt: announcements.archivedAt,
          publishedAt: announcements.publishedAt,
        },
        isNull(announcements.archivedAt),
      )
      .orderBy(
        desc(announcements.isPinned),
        desc(announcements.publishedAt),
        desc(announcements.id),
      )
      .limit(ANNOUNCEMENT_BATCH_SIZE)
      .offset(offset);

    if (batch.length === 0) {
      break;
    }

    for (const row of batch) {
      const audience = normalizeAnnouncementAudience(row.audience);
      if (!canReadAnnouncementAudience(membership, audience)) {
        continue;
      }

      if (seededAnnouncementIds?.has(row.id)) {
        continue;
      }

      visibleRows.push(row);
    }

    if (batch.length < ANNOUNCEMENT_BATCH_SIZE) {
      break;
    }
  }

  return selectRecentAnnouncements(visibleRows);
}

export async function listDashboardMeetings(
  scoped: ScopedClient,
): Promise<DashboardMeeting[]> {
  const rows = await scoped
    .selectFrom<Meeting>(
      meetings,
      {
        id: meetings.id,
        title: meetings.title,
        meetingType: meetings.meetingType,
        startsAt: meetings.startsAt,
        location: meetings.location,
      },
      gte(meetings.startsAt, new Date()),
    )
    .orderBy(asc(meetings.startsAt), asc(meetings.id))
    .limit(DASHBOARD_ITEM_LIMIT);

  return selectUpcomingMeetings(rows);
}

export async function getDashboardViolationSummary(
  scoped: ScopedClient,
): Promise<DashboardViolationSummary> {
  const [statusRows, recentRows] = await Promise.all([
    scoped
      .selectFrom<DashboardViolationStatusCountRow>(
        violations,
        {
          status: violations.status,
          count: sql<number>`count(*)::int`,
        },
      )
      .groupBy(violations.status),
    scoped
      .selectFrom<DashboardViolationRecentRow>(
        violations,
        {
          id: violations.id,
          unitId: violations.unitId,
          category: violations.category,
          status: violations.status,
          severity: violations.severity,
          createdAt: violations.createdAt,
        },
      )
      .orderBy(desc(violations.createdAt), desc(violations.id))
      .limit(DASHBOARD_ITEM_LIMIT),
  ]);

  return buildViolationSummary(statusRows, recentRows);
}

export async function getDashboardOpenMaintenanceCount(
  scoped: ScopedClient,
): Promise<number> {
  const rows = await scoped.selectFrom<{ count: number }>(
    maintenanceRequests,
    {
      count: sql<number>`count(*)::int`,
    },
    inArray(maintenanceRequests.status, [...OPEN_MAINTENANCE_STATUSES]),
  );

  return rows[0]?.count ?? 0;
}
