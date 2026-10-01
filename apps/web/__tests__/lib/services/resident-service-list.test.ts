/**
 * `listResidentsForCommunity` — the Directory fields (owner vs tenant, board
 * designation, portal status) hydrated onto each resident row.
 *
 * Portal-status SQL (auth.users sign-in, invitations, approved access requests)
 * is exercised against a real database by
 * `integration/resident-portal-activity.integration.test.ts`; this pins the
 * derivation and the row shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, selectFromMock, portalActivityMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  selectFromMock: vi.fn(),
  portalActivityMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: () => ({ query: queryMock, selectFrom: selectFromMock }),
  users: { id: 'users.id', email: 'users.email', fullName: 'users.full_name', phone: 'users.phone' },
  communities: {},
  notificationPreferences: {},
  userRoles: { role: 'user_roles.role' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings.join('?'), values }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findCommunityResidentPortalActivity: portalActivityMock,
}));

import {
  derivePortalStatus,
  listResidentsForCommunity,
} from '../../../src/lib/services/resident-service';

const SIGNED_IN = new Date('2026-09-01T12:00:00.000Z');
const INVITED = new Date('2026-08-01T12:00:00.000Z');
const APPROVED = new Date('2026-08-15T12:00:00.000Z');

describe('derivePortalStatus', () => {
  it.each([
    ['signed in (even if also invited)', { lastSignInAt: SIGNED_IN, lastInvitedAt: INVITED, accessApprovedAt: null }, 'active'],
    ['invited, never signed in', { lastSignInAt: null, lastInvitedAt: INVITED, accessApprovedAt: null }, 'invited'],
    ['approved access request, never signed in', { lastSignInAt: null, lastInvitedAt: null, accessApprovedAt: APPROVED }, 'invited'],
    ['nothing on record', { lastSignInAt: null, lastInvitedAt: null, accessApprovedAt: null }, 'not_invited'],
    ['no activity row at all', undefined, 'not_invited'],
  ] as const)('%s → %s', (_label, activity, expected) => {
    expect(derivePortalStatus(activity)).toBe(expected);
  });
});

describe('listResidentsForCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([
      { id: 1, userId: 'u-owner', role: 'resident', unitId: 10, isUnitOwner: true, designation: 'board_president', createdAt: 'c1' },
      { id: 2, userId: 'u-tenant', role: 'resident', unitId: 10, isUnitOwner: false, designation: null, createdAt: 'c2' },
      { id: 3, userId: 'u-pm', role: 'property_manager', unitId: null, isUnitOwner: false, designation: 'not-a-designation', createdAt: 'c3' },
    ]);
    selectFromMock.mockResolvedValue([
      { id: 'u-owner', email: 'o@x.test', fullName: 'Olive Owner', phone: '+13055550100' },
      { id: 'u-tenant', email: 't@x.test', fullName: 'Tom Tenant', phone: null },
      { id: 'u-pm', email: 'pm@x.test', fullName: 'Pat Manager', phone: null },
    ]);
    portalActivityMock.mockResolvedValue(
      new Map([
        ['u-owner', { userId: 'u-owner', lastSignInAt: SIGNED_IN, lastInvitedAt: INVITED, accessApprovedAt: null }],
        ['u-tenant', { userId: 'u-tenant', lastSignInAt: null, lastInvitedAt: INVITED, accessApprovedAt: APPROVED }],
      ]),
    );
  });

  it('hydrates owner flag, designation, phone and portal status per resident', async () => {
    const rows = await listResidentsForCommunity(42, {}, { includePortalActivity: true });

    expect(portalActivityMock).toHaveBeenCalledWith(42);
    expect(rows).toEqual([
      expect.objectContaining({
        userId: 'u-owner',
        isUnitOwner: true,
        designation: 'board_president',
        phone: '+13055550100',
        portalStatus: 'active',
        lastSignInAt: SIGNED_IN.toISOString(),
        lastInvitedAt: INVITED.toISOString(),
      }),
      expect.objectContaining({
        userId: 'u-tenant',
        isUnitOwner: false,
        designation: null,
        portalStatus: 'invited',
        lastSignInAt: null,
        // The newer of invitation and access-request approval.
        lastInvitedAt: APPROVED.toISOString(),
      }),
      expect.objectContaining({
        userId: 'u-pm',
        // An unknown stored value is never passed through as a designation.
        designation: null,
        portalStatus: 'not_invited',
        lastInvitedAt: null,
      }),
    ]);
  });

  it('never reads or returns sign-in history unless asked (residents hold residents:read too)', async () => {
    const rows = await listResidentsForCommunity(42);
    expect(portalActivityMock).not.toHaveBeenCalled();
    for (const row of rows) {
      expect(row).not.toHaveProperty('portalStatus');
      expect(row).not.toHaveProperty('lastSignInAt');
      expect(row).not.toHaveProperty('lastInvitedAt');
    }
    // The directory fields residents legitimately see are still there.
    expect(rows[0]).toMatchObject({ isUnitOwner: true, designation: 'board_president' });
  });

  it('skips the portal lookup when the community has no role rows', async () => {
    queryMock.mockResolvedValue([]);
    await expect(listResidentsForCommunity(42, {}, { includePortalActivity: true })).resolves.toEqual([]);
    expect(portalActivityMock).not.toHaveBeenCalled();
  });
});
