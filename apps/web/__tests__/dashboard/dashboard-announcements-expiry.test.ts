/**
 * The dashboard's announcements card reads the same default feed as the
 * announcements page: an expired announcement is gone from both. It used to
 * filter on archival only, so an expired notice lingered on the dashboard
 * after the page had dropped it.
 */
import { describe, expect, it, vi } from 'vitest';

const { announcementsTable } = vi.hoisted(() => ({
  announcementsTable: {
    id: 'announcements.id',
    title: 'announcements.title',
    body: 'announcements.body',
    audience: 'announcements.audience',
    isPinned: 'announcements.is_pinned',
    archivedAt: 'announcements.archived_at',
    expiresAt: 'announcements.expires_at',
    publishedAt: 'announcements.published_at',
  },
}));

vi.mock('@propertypro/db', () => ({
  announcements: announcementsTable,
  demoSeedRegistry: {},
  maintenanceRequests: {},
  meetings: {},
  users: {},
  violations: {},
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ and: clauses }),
  or: (...clauses: unknown[]) => ({ or: clauses }),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gt: (column: unknown, value: unknown) => ({ gt: [column, value] }),
  gte: vi.fn(),
  lte: vi.fn(),
  isNull: (column: unknown) => ({ isNull: column }),
  inArray: vi.fn(),
  sql: () => 'sql',
}));
vi.mock('@/lib/db/access-control', () => ({ checkPermissionV2: () => true }));

import { listDashboardAnnouncements } from '@/lib/dashboard/dashboard-queries';

describe('listDashboardAnnouncements', () => {
  it('hides expired announcements in SQL, alongside archived ones', async () => {
    const wheres: unknown[] = [];
    const scoped = {
      selectFrom: vi.fn((_table: unknown, _columns: unknown, where?: unknown) => {
        wheres.push(where);
        return { orderBy: () => ({ limit: () => ({ offset: async () => [] }) }) };
      }),
    };
    const membership = {
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      isAdmin: false,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
    };

    await listDashboardAnnouncements(scoped as never, membership as never);

    expect(wheres).toEqual([
      {
        and: [
          { isNull: 'announcements.archived_at' },
          {
            or: [
              { isNull: 'announcements.expires_at' },
              { gt: ['announcements.expires_at', expect.any(Date)] },
            ],
          },
        ],
      },
    ]);
  });
});
