/**
 * syncGoogleCalendar — bounded meeting read (PAG-05).
 *
 * The sync used to call `listCommunityCalendarMeetings(communityId)` with no
 * range, i.e. every meeting since the community's inception. It now pushes a
 * fixed window, `[now - 30d, now + 366d)`, and the service signature makes
 * the range required.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listCommunityCalendarMeetingsMock,
  syncMeetingsMock,
  scopedUpdateMock,
  selectFromMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  listCommunityCalendarMeetingsMock: vi.fn(),
  syncMeetingsMock: vi.fn(),
  scopedUpdateMock: vi.fn(),
  selectFromMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  calendarSyncTokens: { id: 'id', userId: 'userId', provider: 'provider' },
  createScopedClient: () => ({ selectFrom: selectFromMock, update: scopedUpdateMock }),
  decryptToken: (value: string) => `plain:${value}`,
  encryptToken: (value: string) => `enc:${value}`,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
}));

vi.mock('@/lib/services/calendar-data-service', () => ({
  listCommunityCalendarMeetings: listCommunityCalendarMeetingsMock,
}));

vi.mock('@/lib/calendar/google-calendar-adapter', () => ({
  deterministicGoogleCalendarAdapter: { syncMeetings: syncMeetingsMock },
}));

vi.mock('@/lib/services/oauth-state', () => ({
  signPayload: vi.fn(),
  verifySignature: vi.fn(),
}));

import {
  GOOGLE_SYNC_LOOKAHEAD_DAYS,
  GOOGLE_SYNC_LOOKBACK_DAYS,
  googleSyncMeetingWindow,
  syncGoogleCalendar,
} from '../../src/lib/services/calendar-sync-service';

const NOW = new Date('2026-09-30T12:00:00.000Z');

describe('syncGoogleCalendar — bounded meeting window (PAG-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    selectFromMock.mockResolvedValue([
      {
        id: 5,
        communityId: 42,
        userId: 'user-1',
        provider: 'google',
        accessToken: 'a',
        refreshToken: 'r',
        syncToken: null,
        channelId: null,
        channelExpiry: null,
        lastSyncAt: null,
      },
    ]);
    const meetings = [{ id: 1 }, { id: 2 }];
    listCommunityCalendarMeetingsMock.mockResolvedValue(meetings);
    syncMeetingsMock.mockImplementation(async (params: { meetings: unknown[] }) => ({
      syncedCount: params.meetings.length,
      syncToken: 'tok',
      channelId: 'chan',
      channelExpiry: NOW,
    }));
    scopedUpdateMock.mockResolvedValue([]);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads meetings in [now - 30d, now + 366d) and pushes exactly those', async () => {
    const result = await syncGoogleCalendar(42, 'user-1', 'req-1');

    expect(listCommunityCalendarMeetingsMock).toHaveBeenCalledTimes(1);
    expect(listCommunityCalendarMeetingsMock).toHaveBeenCalledWith(42, {
      startUtc: new Date('2026-08-31T12:00:00.000Z'),
      endUtcExclusive: new Date('2027-10-01T12:00:00.000Z'),
    });
    expect(syncMeetingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ meetings: [{ id: 1 }, { id: 2 }] }),
    );
    expect(result.syncedCount).toBe(2);
  });

  it('googleSyncMeetingWindow spans the documented look-back and look-ahead', () => {
    const window = googleSyncMeetingWindow(NOW);
    const day = 24 * 60 * 60 * 1000;
    expect(GOOGLE_SYNC_LOOKBACK_DAYS).toBe(30);
    expect(GOOGLE_SYNC_LOOKAHEAD_DAYS).toBe(366);
    expect((NOW.getTime() - window.startUtc.getTime()) / day).toBe(30);
    expect((window.endUtcExclusive.getTime() - NOW.getTime()) / day).toBe(366);
  });

  it('does not read meetings when Google is not connected (control)', async () => {
    selectFromMock.mockResolvedValueOnce([]);
    await expect(syncGoogleCalendar(42, 'user-1')).rejects.toThrow(
      'Google calendar is not connected for this user',
    );
    expect(listCommunityCalendarMeetingsMock).not.toHaveBeenCalled();
  });
});
