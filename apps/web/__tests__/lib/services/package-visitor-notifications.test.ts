/**
 * What the package and visitor workflows tell the resident, and where it links.
 *
 * These used to go out as `compliance_alert`: the board-and-manager email,
 * titled "Action Required: New package received is overdue", whose button
 * opened the compliance page — which tenants cannot read and apartments do not
 * have. The notification service turns topic + recordId into the link; these
 * tests pin what each sender hands it, and resolve the link through the same
 * table.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  queueNotificationMock,
  listUnitResidentUserIdsMock,
  visitorLogTable,
  packageLogTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  queueNotificationMock: vi.fn(),
  listUnitResidentUserIdsMock: vi.fn(),
  visitorLogTable: { id: Symbol('visitor_log.id'), deletedAt: Symbol('visitor_log.deleted_at') },
  packageLogTable: { id: Symbol('package_log.id') },
}));

vi.mock('@propertypro/db', () => ({
  packageLog: packageLogTable,
  visitorLog: visitorLogTable,
  deniedVisitors: {},
  communities: {},
  createScopedClient: createScopedClientMock,
  logAuditEvent: vi.fn(),
  units: {},
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gte: (col: unknown, val: unknown) => ({ __gte: { col, val } }),
  inArray: (col: unknown, vals: unknown[]) => ({ __inArray: { col, vals } }),
  isNotNull: (col: unknown) => ({ __isNotNull: col }),
  isNull: (col: unknown) => ({ __isNull: col }),
  lt: (col: unknown, val: unknown) => ({ __lt: { col, val } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: { strings, values } }),
}));

vi.mock('@/lib/services/units-lookup', () => ({
  getUnitLabelMap: vi.fn(async () => new Map()),
}));

vi.mock('@/lib/units/actor-units', () => ({
  listUnitResidentUserIds: listUnitResidentUserIdsMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: queueNotificationMock,
}));

import {
  checkInVisitorForCommunity,
  createPackageForCommunity,
  revokeVisitorForCommunity,
} from '../../../src/lib/services/package-visitor-service';
import { residentNoticePath } from '../../../src/lib/services/resident-notice-routes';

const COMMUNITY_ID = 42;

function visitorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    communityId: COMMUNITY_ID,
    visitorName: 'Ana Ruiz',
    hostUnitId: 3,
    hostUserId: 'tenant-3',
    checkedInAt: null,
    revokedAt: null,
    validUntil: null,
    ...overrides,
  };
}

function lastEvent() {
  const call = queueNotificationMock.mock.calls.at(-1)!;
  return { event: call[1], recipient: call[2] };
}

beforeEach(() => {
  vi.clearAllMocks();
  queueNotificationMock.mockResolvedValue(undefined);
});

describe('package and visitor notices', () => {
  it('tells each unit resident about a new package and links to their packages', async () => {
    const created = { id: 31, unitId: 3, recipientName: 'Tenant Three', carrier: 'UPS' };
    createScopedClientMock.mockReturnValue({
      insert: vi.fn().mockResolvedValue([created]),
      update: vi.fn().mockResolvedValue([{ ...created, status: 'notified' }]),
    });
    listUnitResidentUserIdsMock.mockResolvedValue(['tenant-3']);

    await createPackageForCommunity(COMMUNITY_ID, 'staff-1', { unitId: 3, recipientName: 'Tenant Three', carrier: 'UPS' });

    const { event, recipient } = lastEvent();
    expect(event).toEqual({
      type: 'resident_notice',
      topic: 'package',
      title: 'New package received',
      description: 'UPS delivery for Tenant Three',
      severity: 'info',
      recordId: '31',
      sourceId: '31',
    });
    expect(recipient).toEqual({ type: 'specific_user', userId: 'tenant-3' });
    expect(residentNoticePath(event.topic, COMMUNITY_ID, event.recordId)).toBe(
      `/dashboard/packages?communityId=${COMMUNITY_ID}`,
    );
  });

  it('tells the host their visitor checked in and links to their visitors', async () => {
    const existing = visitorRow();
    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn().mockResolvedValue([existing]),
      update: vi.fn().mockResolvedValue([{ ...existing, checkedInAt: new Date() }]),
    });

    await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    const { event, recipient } = lastEvent();
    expect(event).toEqual({
      type: 'resident_notice',
      topic: 'visitor',
      title: 'Ana Ruiz has checked in',
      description: 'Your visitor Ana Ruiz was checked in successfully.',
      severity: 'info',
      recordId: '12',
      sourceId: '12:checked_in',
    });
    expect(recipient).toEqual({ type: 'specific_user', userId: 'tenant-3' });
    expect(residentNoticePath(event.topic, COMMUNITY_ID, event.recordId)).toBe(
      `/dashboard/visitors?communityId=${COMMUNITY_ID}`,
    );
  });

  it('tells the host their pass was revoked, under a digest key distinct from check-in', async () => {
    const existing = visitorRow();
    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn().mockResolvedValue([existing]),
      update: vi.fn().mockResolvedValue([{ ...existing, revokedAt: new Date(), revokedByUserId: 'staff-1' }]),
    });

    await revokeVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1', 'Denied at gate', null);

    const { event } = lastEvent();
    expect(event).toEqual({
      type: 'resident_notice',
      topic: 'visitor',
      title: 'Ana Ruiz visitor pass revoked',
      description: 'The visitor pass for Ana Ruiz was revoked. Reason: Denied at gate',
      severity: 'info',
      recordId: '12',
      sourceId: '12:revoked',
    });
    expect(residentNoticePath(event.topic, COMMUNITY_ID, event.recordId)).toBe(
      `/dashboard/visitors?communityId=${COMMUNITY_ID}`,
    );
  });
});
