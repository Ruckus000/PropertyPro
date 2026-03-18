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

import { executeBroadcast } from '../../src/lib/services/emergency-broadcast-service';

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
});
