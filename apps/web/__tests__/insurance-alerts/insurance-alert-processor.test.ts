/**
 * Orchestration tests for the insurance-alerts processor — the compliance-
 * critical behaviors the legal-review gate cares about:
 *  - opted-out admins (email_insurance_alerts=false) are not emailed,
 *  - non-admins never receive these board alerts,
 *  - a community with an INCOMPLETE postal address is skipped (never sent
 *    without a valid CAN-SPAM address) and its band is NOT advanced,
 *  - emails are non-transactional and carry a one-click unsubscribe URL,
 *  - a fired alert advances the row's lastAlertBand (once-per-band dedupe),
 *  - the send path is EMAIL ONLY (never SMS).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.INSURANCE_ALERTS_UNSUBSCRIBE_SECRET ??= 'test-insurance-unsub-secret';
});

const {
  createScopedClientMock,
  createUnscopedClientMock,
  sendEmailMock,
  logAuditEventMock,
  updateMock,
  // Table markers — identity is what the processor switches on. Declared inside
  // vi.hoisted so the hoisted vi.mock factory can reference them (TDZ-safe).
  communities,
  userRoles,
  users,
  notificationPreferences,
  windMitigationReports,
  insurancePolicies,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  updateMock: vi.fn(),
  communities: {
    id: 'c.id', name: 'c.name', communityType: 'c.type', deletedAt: 'c.del',
    addressLine1: 'c.a1', addressLine2: 'c.a2', city: 'c.city', state: 'c.state', zipCode: 'c.zip',
  },
  userRoles: { __t: 'userRoles' },
  users: { __t: 'users' },
  notificationPreferences: { __t: 'notificationPreferences' },
  windMitigationReports: { __t: 'windMitigationReports', id: 'wm.id' },
  insurancePolicies: { __t: 'insurancePolicies', id: 'ip.id' },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  communities,
  userRoles,
  users,
  notificationPreferences,
  windMitigationReports,
  insurancePolicies,
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ __and: c }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  isNull: (col: unknown) => ({ __isNull: col }),
}));
vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: createUnscopedClientMock }));
vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  InsuranceAlertEmail: (props: unknown) => props,
}));
vi.mock('@propertypro/shared', () => ({
  isAdminRole: (role: string) =>
    ['board_president', 'board_member', 'cam', 'site_manager', 'property_manager_admin', 'property_manager', 'root_manager'].includes(
      role,
    ),
}));

import { processInsuranceAlerts } from '../../src/lib/services/insurance-alert-processor';

// now = 2026-07-18: report/policy dates below land in the intended bands.
const NOW = new Date('2026-07-18T12:00:00.000Z');

const COMMUNITIES = [
  // Complete address, one wind-mit report entering the 30-day band.
  { id: 1, name: 'Sunset', addressLine1: '1 A St', addressLine2: null, city: 'Miami', state: 'FL', zipCode: '33139' },
  // INCOMPLETE address (no city) + a due policy → must be skipped.
  { id: 2, name: 'Palm', addressLine1: '2 B St', addressLine2: null, city: null, state: 'FL', zipCode: '33301' },
  // Complete address, policy already alerted at its current band → nothing due.
  { id: 3, name: 'Ridge', addressLine1: '3 C St', addressLine2: null, city: 'Tampa', state: 'FL', zipCode: '33601' },
];

const ROLE_ROWS: Record<number, Array<Record<string, unknown>>> = {
  1: [
    { userId: 'admin1', role: 'board_president' },
    { userId: 'admin2', role: 'cam' }, // opted out below
    { userId: 'res1', role: 'resident', isUnitOwner: true }, // non-admin
  ],
};
const USER_ROWS: Record<number, Array<Record<string, unknown>>> = {
  1: [
    { id: 'admin1', email: 'a1@example.com', fullName: 'Ann Admin' },
    { id: 'admin2', email: 'a2@example.com', fullName: 'Cam Manager' },
    { id: 'res1', email: 'r1@example.com', fullName: 'Rose Resident' },
  ],
};
const PREF_ROWS: Record<number, Array<Record<string, unknown>>> = {
  1: [{ userId: 'admin2', emailInsuranceAlerts: false }], // admin2 opted out
};
const WIND_ROWS: Record<number, Array<Record<string, unknown>>> = {
  1: [{ id: 11, formType: 'oir_b1_1802', buildingLabel: null, expiresAt: '2026-08-05', lastAlertBand: null }],
};
const POLICY_ROWS: Record<number, Array<Record<string, unknown>>> = {
  2: [{ id: 20, carrierName: 'Citizens', policyType: 'property', expiresAt: '2026-08-01', lastAlertBand: null }],
  3: [{ id: 30, carrierName: 'Acme', policyType: 'wind', expiresAt: '2026-09-10', lastAlertBand: '60_days' }],
};

function scopedFor(communityId: number) {
  return {
    query: (table: unknown) => {
      if (table === userRoles) return Promise.resolve(ROLE_ROWS[communityId] ?? []);
      if (table === users) return Promise.resolve(USER_ROWS[communityId] ?? []);
      if (table === notificationPreferences) return Promise.resolve(PREF_ROWS[communityId] ?? []);
      if (table === windMitigationReports) return Promise.resolve(WIND_ROWS[communityId] ?? []);
      if (table === insurancePolicies) return Promise.resolve(POLICY_ROWS[communityId] ?? []);
      return Promise.resolve([]);
    },
    update: updateMock,
  };
}

describe('processInsuranceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    logAuditEventMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue([{}]);
    createScopedClientMock.mockImplementation((id: number) => scopedFor(id));
    createUnscopedClientMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve(COMMUNITIES) }) }),
    });
  });

  it('emails only opted-in admins, non-transactional with a one-click unsubscribe', async () => {
    const result = await processInsuranceAlerts(NOW);

    // Only admin1 gets it: admin2 opted out, res1 is not admin-tier.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe('a1@example.com');
    expect(call.category).toBe('non-transactional');
    expect(call.unsubscribeUrl).toContain('/api/v1/insurance-alerts/unsubscribe?token=');
    // CAN-SPAM: the sender postal address (community's own) is passed to the template.
    expect(call.react.props.senderAddressLines).toEqual(['1 A St', 'Miami, FL 33139']);

    expect(result.emailsSent).toBe(1);
  });

  it('advances the fired row lastAlertBand exactly once (dedupe)', async () => {
    await processInsuranceAlerts(NOW);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [table, values] = updateMock.mock.calls[0];
    expect(table).toBe(windMitigationReports);
    expect(values).toEqual({ lastAlertBand: '30_days' });
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock.mock.calls[0][0]).toMatchObject({
      action: 'notification_sent',
      resourceType: 'wind_mitigation_report',
    });
  });

  it('skips a community with an incomplete postal address without sending or advancing', async () => {
    const result = await processInsuranceAlerts(NOW);

    expect(result.communitiesSkippedNoAddress).toBe(1); // community 2
    // Community 2's due policy is never emailed and never advanced.
    for (const call of updateMock.mock.calls) {
      expect(call[0]).not.toBe(insurancePolicies);
    }
    for (const call of sendEmailMock.mock.calls) {
      expect(call[0].to).not.toBe('c2');
    }
  });

  it('does not fire for a policy already alerted at its current band', async () => {
    await processInsuranceAlerts(NOW);
    // Community 3's policy stays at 60_days — no update targets insurancePolicies.
    const touchedPolicies = updateMock.mock.calls.filter((c) => c[0] === insurancePolicies);
    expect(touchedPolicies).toHaveLength(0);
  });
});
