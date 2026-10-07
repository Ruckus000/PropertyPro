/**
 * `lib/services/notice-consent-service.ts` — owner consent to electronic notice.
 *
 * Pinned: a give inserts the versioned wording for the address and audits it;
 * a repeat at the same address is a no-op; a give at a new address withdraws
 * the old consent first; a lost insert race is not an error; a withdrawal
 * audits only when there was something to withdraw.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: () => ({ selectFrom: h.selectFromMock, insert: h.insertMock, update: h.updateMock }),
  logAuditEvent: h.logAuditEventMock,
  noticeConsent: { userId: 'notice_consent.user_id', revokedAt: 'notice_consent.revoked_at' },
  users: { id: 'users.id', email: 'users.email' },
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ and: c }),
  eq: (col: unknown, v: unknown) => ({ eq: [col, v] }),
  isNull: (col: unknown) => ({ isNull: col }),
}));

import { NOTICE_CONSENT_VERSION, noticeConsentText } from '@propertypro/shared';
import { giveNoticeConsent, withdrawNoticeConsent } from '../../src/lib/services/notice-consent-service';

const GIVEN_AT = new Date('2026-10-06T12:00:00Z');
const active = (email: string) => [{ id: 1, email, consentVersion: NOTICE_CONSENT_VERSION, givenAt: GIVEN_AT }];
const PARAMS = { communityId: 7, userId: 'u-1', email: 'owner@example.com', ipAddress: '1.2.3.4', userAgent: 'UA' };

beforeEach(() => {
  vi.clearAllMocks();
  h.insertMock.mockResolvedValue([{}]);
  h.updateMock.mockResolvedValue([]);
});

describe('giveNoticeConsent', () => {
  it('inserts the versioned wording for the address and audits it', async () => {
    h.selectFromMock.mockResolvedValueOnce([]).mockResolvedValueOnce(active('owner@example.com'));
    await expect(giveNoticeConsent(PARAMS)).resolves.toMatchObject({ consented: true, email: 'owner@example.com' });
    expect(h.insertMock).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u-1',
      email: 'owner@example.com',
      consentText: noticeConsentText('owner@example.com'),
      consentVersion: NOTICE_CONSENT_VERSION,
      ipAddress: '1.2.3.4',
      userAgent: 'UA',
    });
    expect(h.logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notice_consent_given',
        resourceType: 'notice_consent',
        communityId: 7,
        newValues: { email: 'owner@example.com', consentVersion: NOTICE_CONSENT_VERSION },
      }),
    );
    // IP and user agent stay on the consent row; the audit log is manager-readable and permanent.
    expect(JSON.stringify(h.logAuditEventMock.mock.calls)).not.toMatch(/1\.2\.3\.4|"UA"/);
  });

  it('is a no-op when already consented at the same address', async () => {
    h.selectFromMock.mockResolvedValue(active('owner@example.com'));
    await giveNoticeConsent(PARAMS);
    expect(h.insertMock).not.toHaveBeenCalled();
    expect(h.updateMock).not.toHaveBeenCalled();
    expect(h.logAuditEventMock).not.toHaveBeenCalled();
  });

  it('withdraws the old consent before recording one for a new address', async () => {
    h.selectFromMock.mockResolvedValueOnce(active('old@example.com')).mockResolvedValueOnce(active('owner@example.com'));
    h.updateMock.mockResolvedValueOnce(active('old@example.com'));
    await giveNoticeConsent(PARAMS);
    expect(h.updateMock).toHaveBeenCalledTimes(1);
    expect(h.insertMock).toHaveBeenCalledTimes(1);
    expect(h.logAuditEventMock.mock.calls.map(([e]) => e.action)).toEqual(['notice_consent_withdrawn', 'notice_consent_given']);
    expect(h.logAuditEventMock.mock.calls[0]![0].metadata).toEqual({ reason: 'email_changed' });
  });

  it('treats a lost race on the active-row index as already consented', async () => {
    h.selectFromMock.mockResolvedValueOnce([]).mockResolvedValueOnce(active('owner@example.com'));
    h.insertMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505', constraint_name: 'notice_consent_active_uq' }));
    await expect(giveNoticeConsent(PARAMS)).resolves.toMatchObject({ consented: true });
    expect(h.logAuditEventMock).not.toHaveBeenCalled();
  });

  it('rethrows any other insert failure', async () => {
    h.selectFromMock.mockResolvedValueOnce([]);
    h.insertMock.mockRejectedValueOnce(new Error('db down'));
    await expect(giveNoticeConsent(PARAMS)).rejects.toThrow('db down');
  });
});

describe('withdrawNoticeConsent', () => {
  it('stamps revoked_at on the active row and audits what was withdrawn', async () => {
    h.updateMock.mockResolvedValueOnce(active('owner@example.com'));
    await expect(withdrawNoticeConsent(7, 'u-1')).resolves.toBe(true);
    expect(h.updateMock).toHaveBeenCalledWith(
      expect.anything(),
      { revokedAt: expect.any(Date) },
      { and: [{ eq: ['notice_consent.user_id', 'u-1'] }, { isNull: 'notice_consent.revoked_at' }] },
    );
    expect(h.logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notice_consent_withdrawn',
        oldValues: { email: 'owner@example.com', consentVersion: NOTICE_CONSENT_VERSION },
      }),
    );
  });

  it('audits nothing when there was no consent to withdraw', async () => {
    await expect(withdrawNoticeConsent(7, 'u-1')).resolves.toBe(false);
    expect(h.logAuditEventMock).not.toHaveBeenCalled();
  });
});
