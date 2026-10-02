/**
 * Every command-palette result must open a page that exists, in the right
 * community. Before this, meetings (`/meetings/:id`) and residents
 * (`/residents/:id`) pointed at routes with no page (404), and violations
 * omitted the communityId its page requires.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const row = { id: 5, title: 'Pool', relevance: 1 };
vi.mock('@propertypro/db', () => ({
  searchDocumentsByTrigram: vi.fn(async () => ({ totalCount: 1, results: [{ ...row, category_name: 'Rules', mime_type: 'application/pdf' }] })),
  searchMeetingsByTrigram: vi.fn(async () => ({ totalCount: 1, results: [{ ...row, meeting_type: 'board', starts_at: null }] })),
  searchMaintenanceByTrigram: vi.fn(async () => ({ totalCount: 1, results: [{ ...row, priority: 'low', status: 'open' }] })),
  searchViolationsByTrigram: vi.fn(async () => ({ totalCount: 1, results: [{ ...row, description: 'Loud music', status: 'reported', severity: 'minor' }] })),
  searchResidentsByTrigram: vi.fn(async () => ({ totalCount: 1, results: [{ id: 'u-1', full_name: 'Ana', email: 'a@x.test', role: 'resident', unit_number: '4B', relevance: 1 }] })),
}));
vi.mock('@/lib/announcements/read-visibility', () => ({
  searchVisibleAnnouncements: vi.fn(async () => ({ totalCount: 1, rows: [{ ...row, audience: 'all', publishedAt: null }] })),
  formatAnnouncementAudienceLabel: () => 'Everyone',
}));
vi.mock('@/lib/db/access-control', () => ({
  getMembershipResourceAccess: () =>
    new Proxy({}, { get: () => ({ read: true, write: true }) }),
}));

import { searchAccessibleGroups } from '../data-search-service';

const membership = {
  userId: 'pm-1',
  communityId: 42,
  role: 'property_manager',
  communityType: 'condo_718',
  subscriptionPlan: 'professional',
  isAdmin: true,
  isUnitOwner: false,
} as unknown as Parameters<typeof searchAccessibleGroups>[1];

describe('search result links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('point at real pages, scoped to the community', async () => {
    const groups = await searchAccessibleGroups(42, membership, 'pool', 5);
    const hrefs = Object.fromEntries(groups.map((g) => [g.key, g.results[0]?.href]));
    expect(hrefs).toMatchObject({
      documents: '/documents/5?communityId=42',
      announcements: '/announcements/5?communityId=42',
      meetings: '/communities/42/meetings',
      violations: '/violations/5?communityId=42',
      // The Directory's residents list, filtered to the person found.
      residents: '/dashboard/directory?communityId=42&q=Ana&tab=residents',
    });
    for (const href of Object.values(hrefs)) {
      expect(href).not.toMatch(/^\/(meetings|residents)\/\w/);
    }
  });
});
