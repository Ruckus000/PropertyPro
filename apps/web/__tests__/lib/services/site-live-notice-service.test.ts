/**
 * The "Email owners" offer's state and its claim (website builder, D5).
 *
 * The claim is the one-send guarantee, so the test that matters most pins the
 * WHERE of its UPDATE: `site_live_notice_sent_at IS NULL` is what lets the
 * database, not a read-then-write, decide which of two concurrent requests
 * sends.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, queryWhereMock, updateMock, tables } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryWhereMock: vi.fn(),
  updateMock: vi.fn(),
  tables: {
    communities: {
      __table: 'communities',
      siteLiveNoticeSentAt: Symbol('communities.site_live_notice_sent_at'),
      siteLiveNoticeDismissedAt: Symbol('communities.site_live_notice_dismissed_at'),
    },
    userRoles: {
      __table: 'user_roles',
      role: Symbol('user_roles.role'),
      isUnitOwner: Symbol('user_roles.is_unit_owner'),
    },
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: () => ({ query: queryMock, queryWhere: queryWhereMock, update: updateMock }),
  communities: tables.communities,
  userRoles: tables.userRoles,
}));
vi.mock('@propertypro/db/filters', () => ({
  isNull: (column: unknown) => ({ __isNull: column }),
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
}));

import {
  claimSiteLiveNotice,
  dismissSiteLiveNotice,
  getSiteLiveNoticeState,
  releaseSiteLiveNotice,
} from '@/lib/services/site-live-notice-service';

const COMMUNITY_ID = 42;
const SENT = new Date('2026-10-29T12:00:00.000Z');

function seed(
  community: Record<string, unknown>,
  roles: Array<Record<string, unknown>>,
): void {
  queryMock.mockImplementation(async (table: unknown) =>
    table === tables.communities ? [{ id: COMMUNITY_ID, ...community }] : [],
  );
  // The database applies the WHERE; evaluate the clauses the service sent.
  const field = new Map<unknown, string>([
    [tables.userRoles.role, 'role'],
    [tables.userRoles.isUnitOwner, 'isUnitOwner'],
  ]);
  queryWhereMock.mockImplementation(async (table: unknown, where: { __and: Array<{ __eq: [unknown, unknown] }> }) => {
    if (table !== tables.userRoles) return [];
    return roles.filter((row) =>
      where.__and.every(({ __eq: [column, value] }) => row[field.get(column) as string] === value),
    );
  });
}

const OWNER = { userId: 'u-owner', role: 'resident', isUnitOwner: true };
const TENANT = { userId: 'u-tenant', role: 'resident', isUnitOwner: false };
const MANAGER = { userId: 'u-mgr', role: 'property_manager', isUnitOwner: false };

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue([{ id: COMMUNITY_ID }]);
});

describe('getSiteLiveNoticeState', () => {
  it('counts resident owners only, and offers the email while nothing has happened', async () => {
    seed({}, [OWNER, { ...OWNER, userId: 'u-owner-2' }, TENANT, MANAGER]);

    await expect(getSiteLiveNoticeState(COMMUNITY_ID)).resolves.toEqual({
      sentAt: null,
      dismissedAt: null,
      ownerCount: 2,
      offerable: true,
    });
  });

  it('counts a person holding two owner rows once', async () => {
    seed({}, [OWNER, OWNER]);

    expect((await getSiteLiveNoticeState(COMMUNITY_ID)).ownerCount).toBe(1);
  });

  it('offerable is false without owners, after sending, or after dismissing', async () => {
    seed({}, [TENANT, MANAGER]);
    expect(await getSiteLiveNoticeState(COMMUNITY_ID)).toMatchObject({
      ownerCount: 0,
      offerable: false,
    });

    seed({ siteLiveNoticeSentAt: SENT }, [OWNER]);
    expect(await getSiteLiveNoticeState(COMMUNITY_ID)).toEqual({
      sentAt: SENT.toISOString(),
      dismissedAt: null,
      ownerCount: 1,
      offerable: false,
    });

    seed({ siteLiveNoticeDismissedAt: SENT }, [OWNER]);
    expect(await getSiteLiveNoticeState(COMMUNITY_ID)).toEqual({
      sentAt: null,
      dismissedAt: SENT.toISOString(),
      ownerCount: 1,
      offerable: false,
    });
  });
});

describe('claimSiteLiveNotice', () => {
  it('stamps sent_at only where it is still NULL, and says whether this call won', async () => {
    updateMock.mockResolvedValueOnce([{ id: COMMUNITY_ID }]);
    await expect(claimSiteLiveNotice(COMMUNITY_ID)).resolves.toBe(true);

    expect(updateMock).toHaveBeenCalledWith(
      tables.communities,
      { siteLiveNoticeSentAt: expect.any(Date) },
      { __isNull: tables.communities.siteLiveNoticeSentAt },
    );

    // The row was already claimed: the guarded UPDATE changes nothing.
    updateMock.mockResolvedValueOnce([]);
    await expect(claimSiteLiveNotice(COMMUNITY_ID)).resolves.toBe(false);
  });
});

describe('releaseSiteLiveNotice and dismissSiteLiveNotice', () => {
  it('release clears sent_at so the manager can try again', async () => {
    await releaseSiteLiveNotice(COMMUNITY_ID);

    expect(updateMock).toHaveBeenCalledWith(tables.communities, { siteLiveNoticeSentAt: null });
  });

  it('dismiss stamps dismissed_at once', async () => {
    await dismissSiteLiveNotice(COMMUNITY_ID);

    expect(updateMock).toHaveBeenCalledWith(
      tables.communities,
      { siteLiveNoticeDismissedAt: expect.any(Date) },
      { __isNull: tables.communities.siteLiveNoticeDismissedAt },
    );
  });
});
