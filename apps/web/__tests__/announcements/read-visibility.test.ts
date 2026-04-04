import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyDemoAnnouncementProvenancePolicyMock } = vi.hoisted(() => ({
  applyDemoAnnouncementProvenancePolicyMock: vi.fn(),
}));

vi.mock('../../src/lib/announcements/demo-announcement-provenance', () => ({
  applyDemoAnnouncementProvenancePolicy: applyDemoAnnouncementProvenancePolicyMock,
}));

import { filterVisibleAnnouncements } from '../../src/lib/announcements/read-visibility';

function announcement(id: number, audience: 'all' | 'owners_only' | 'board_only' | 'tenants_only') {
  return {
    id,
    title: `Announcement ${id}`,
    body: `Body ${id}`,
    audience,
    isPinned: false,
    archivedAt: null,
    publishedAt: new Date(`2026-02-0${id}T12:00:00.000Z`),
  } as never;
}

const community = {
  id: 77,
  isDemo: false,
  trialEndsAt: null,
  demoExpiresAt: null,
};

describe('announcement read visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyDemoAnnouncementProvenancePolicyMock.mockImplementation(async (_community, rows) => rows);
  });

  it('shows owners only announcements to owner residents but not tenant-only or board-only rows', async () => {
    const membership = {
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      isAdmin: false,
    } as never;

    const result = await filterVisibleAnnouncements(
      community,
      membership,
      [
        announcement(1, 'all'),
        announcement(2, 'owners_only'),
        announcement(3, 'tenants_only'),
        announcement(4, 'board_only'),
      ],
    );

    expect(result.rows.map((row) => row.id)).toEqual([2, 1]);
    expect(result.totalCount).toBe(2);
  });

  it('shows tenant-only announcements to tenant residents and honors query filtering', async () => {
    const membership = {
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: false,
    } as never;

    const result = await filterVisibleAnnouncements(
      community,
      membership,
      [
        { ...announcement(1, 'all'), title: 'General update' },
        { ...announcement(2, 'tenants_only'), title: 'Tenant reminder' },
        { ...announcement(3, 'owners_only'), title: 'Owner budget' },
      ] as never,
      { query: 'tenant' },
    );

    expect(result.rows.map((row) => row.id)).toEqual([2]);
    expect(result.totalCount).toBe(1);
  });

  it('allows admins to see every visible audience and respects demo provenance filtering', async () => {
    applyDemoAnnouncementProvenancePolicyMock.mockImplementation(async (_community, rows) =>
      rows.filter((row: { id: number }) => row.id !== 4),
    );

    const membership = {
      role: 'pm_admin',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
    } as never;

    const result = await filterVisibleAnnouncements(
      community,
      membership,
      [
        announcement(1, 'all'),
        announcement(2, 'owners_only'),
        announcement(3, 'tenants_only'),
        announcement(4, 'board_only'),
      ],
    );

    expect(result.rows.map((row) => row.id)).toEqual([3, 2, 1]);
    expect(result.totalCount).toBe(3);
  });

  it('fails closed for managers without announcement read access', async () => {
    const membership = {
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      permissions: {
        resources: {
          announcements: { read: false, write: true },
        },
      },
    } as never;

    const result = await filterVisibleAnnouncements(
      community,
      membership,
      [announcement(1, 'all'), announcement(2, 'owners_only')],
    );

    expect(result.rows).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});
