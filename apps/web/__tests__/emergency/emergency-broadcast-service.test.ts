import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendBulkEmergencySmsMock,
  logAuditEventMock,
  sendEmailMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendBulkEmergencySmsMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  sendEmailMock: vi.fn(),
  tables: {
    communities: Symbol('communities'),
    emergencyBroadcastRecipients: Symbol('emergency_broadcast_recipients'),
    emergencyBroadcasts: Symbol('emergency_broadcasts'),
    notificationPreferences: Symbol('notification_preferences'),
    userRoles: Symbol('user_roles'),
    users: Symbol('users'),
  },
}));

vi.mock('@propertypro/db', () => ({
  communities: tables.communities,
  createScopedClient: createScopedClientMock,
  emergencyBroadcastRecipients: tables.emergencyBroadcastRecipients,
  emergencyBroadcasts: tables.emergencyBroadcasts,
  logAuditEvent: logAuditEventMock,
  notificationPreferences: tables.notificationPreferences,
  userRoles: tables.userRoles,
  users: tables.users,
}));

vi.mock('@propertypro/email', () => ({
  EmergencyAlertEmail: vi.fn(),
  sendEmail: sendEmailMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('@/lib/services/sms/sms-service', () => ({
  sendBulkEmergencySms: sendBulkEmergencySmsMock,
}));

import { createBroadcast, executeBroadcast } from '../../src/lib/services/emergency-broadcast-service';

describe('emergency-broadcast-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects broadcasts that exceed the recipient cap before sending', async () => {
    // selectFrom returns a thenable builder — mock it as a promise that resolves to rows
    const selectFrom = vi.fn((table: symbol) => {
      if (table === tables.emergencyBroadcasts) {
        return Promise.resolve([{
          id: 7,
          body: 'Emergency body',
          smsBody: null,
          title: 'Storm Alert',
          severity: 'emergency',
          canceledAt: null,
          completedAt: null,
        }]);
      }

      if (table === tables.emergencyBroadcastRecipients) {
        return Promise.resolve(Array.from({ length: 501 }, (_, index) => ({
          broadcastId: 7,
          userId: `user-${index}`,
          phone: '+13055551234',
          email: `user-${index}@example.com`,
          smsStatus: 'pending',
          emailStatus: 'pending',
        })));
      }

      return Promise.resolve([]);
    });

    createScopedClientMock.mockReturnValue({
      selectFrom,
      update: vi.fn(),
    });

    await expect(executeBroadcast(7, 42, 'actor-1')).rejects.toThrow(
      'Broadcast exceeds maximum recipient limit of 500',
    );

    expect(sendBulkEmergencySmsMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  // ── SMS legal gate degrades to email, never refuses ────────────────────────
  //
  // This is the single most important behavioural claim in the SMS gating work.
  // Emergency broadcasts deliberately bypass even the subscription guard
  // ("life-safety over revenue"), so disabling SMS must NOT prevent an alert
  // going out — it must quietly drop the SMS leg and still deliver by email.
  // A 403 at the route would have failed this test, which is why the gate lives
  // here instead. See docs/audits/2026-08-09-legal-risk-audit.md F-10.
  describe('smsAllowed gate', () => {
    function mockCommunityWithRecipients() {
      const inserted: Array<Record<string, unknown>[]> = [];
      const selectFrom = vi.fn((table: symbol) => {
        if (table === tables.userRoles) {
          return Promise.resolve([
            { userId: 'u1', role: 'resident', isUnitOwner: true },
          ]);
        }
        if (table === tables.users) {
          return Promise.resolve([
            {
              id: 'u1',
              email: 'owner@example.com',
              fullName: 'Owner One',
              phone: '+13055551234',
              phoneVerifiedAt: new Date('2026-01-01T00:00:00Z'),
            },
          ]);
        }
        if (table === tables.notificationPreferences) {
          return Promise.resolve([
            {
              userId: 'u1',
              smsEnabled: true,
              smsConsentGivenAt: new Date('2026-01-01T00:00:00Z'),
              smsConsentRevokedAt: null,
              smsEmergencyOnly: false,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      createScopedClientMock.mockReturnValue({
        selectFrom,
        insert: vi.fn(async (table: symbol, rows: Record<string, unknown>[]) => {
          if (table === tables.emergencyBroadcasts) return [{ id: 501 }];
          inserted.push(rows);
          return rows;
        }),
        update: vi.fn(async () => undefined),
      });
      logAuditEventMock.mockResolvedValue(undefined);
      return { inserted };
    }

    const baseParams = {
      communityId: 42,
      title: 'Hurricane warning',
      body: 'Evacuate immediately.',
      smsBody: 'Evacuate now.',
      severity: 'emergency' as const,
      targetAudience: 'all' as const,
      channels: ['sms', 'email'] as Array<'sms' | 'email'>,
      initiatedBy: 'admin-1',
    };

    it('sends by email only when smsAllowed is false', async () => {
      const { inserted } = mockCommunityWithRecipients();

      const result = await createBroadcast({ ...baseParams, smsAllowed: false });

      // The alert still goes out.
      expect(result.emailCount).toBeGreaterThan(0);
      // But nobody is queued for SMS.
      expect(result.smsEligibleCount).toBe(0);

      const recipients = inserted.flat();
      expect(recipients).not.toHaveLength(0);
      for (const r of recipients) {
        expect(r.smsStatus).toBe('skipped');
        // Phone deliberately nulled so no downstream path can reach it.
        expect(r.phone).toBeNull();
        expect(r.emailStatus).toBe('pending');
      }
    });

    it('queues SMS when smsAllowed is true and the resident consented', async () => {
      const { inserted } = mockCommunityWithRecipients();

      const result = await createBroadcast({ ...baseParams, smsAllowed: true });

      expect(result.smsEligibleCount).toBe(1);
      const recipients = inserted.flat();
      expect(recipients[0]?.smsStatus).toBe('pending');
      expect(recipients[0]?.phone).toBe('+13055551234');
    });

    it('does not throw when SMS is gated off', async () => {
      mockCommunityWithRecipients();
      await expect(
        createBroadcast({ ...baseParams, smsAllowed: false }),
      ).resolves.toBeDefined();
    });
  });

});
