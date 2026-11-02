/**
 * buildQuickActions / buildMetricTiles (spec section 5, D17, D18). Pure: no DB, no mocks.
 */
import { describe, expect, it } from 'vitest';
import { getEffectiveFeatures } from '@propertypro/shared';
import type { CalendarMeetingRecord } from '@/lib/services/calendar-data-service';
import { buildMetricTiles, buildQuickActions } from '@/lib/dashboard/quick-actions';

const PRO = getEffectiveFeatures('condo_718', 'professional');
const ESSENTIALS = getEffectiveFeatures('hoa_720', 'essentials');
const CID = 7;

const actions = (over: Partial<Parameters<typeof buildQuickActions>[0]> = {}) =>
  buildQuickActions({
    audience: 'manager',
    communityId: CID,
    features: PRO,
    canWriteAnnouncements: true,
    pendingSignatures: 0,
    supportSession: false,
    ...over,
  });

describe('buildQuickActions', () => {
  it('manager, board, resident orders match spec section 5', () => {
    expect(actions({ pendingSignatures: 2 }).map((a) => [a.label, a.href])).toEqual([
      ['New announcement', '/announcements/new?communityId=7'],
      ['Upload document', '/documents?communityId=7'],
      ['Schedule meeting', '/meetings?communityId=7'],
      ['Sign 2 documents', '#documents-to-sign'],
    ]);
    expect(actions({ audience: 'board', pendingSignatures: 1 }).map((a) => [a.label, a.href])).toEqual([
      ['Find a document', '/documents?communityId=7'],
      ['Report a problem', '/violations/report?communityId=7'],
      ['Sign 1 document', '#documents-to-sign'],
      ['Update my contact info', '/settings/account?communityId=7'],
    ]);
    expect(actions({ audience: 'resident' }).map((a) => [a.label, a.href])).toEqual([
      ['Ask for a repair', '/maintenance/submit?communityId=7'],
      ['Find a document', '/documents?communityId=7'],
      ['Report a problem', '/violations/report?communityId=7'],
      ['Update my contact info', '/settings/account?communityId=7'],
    ]);
  });

  it('manager without announcements write loses that action only', () => {
    expect(actions({ canWriteAnnouncements: false }).map((a) => a.id)).toEqual(['upload-document', 'schedule-meeting']);
  });

  it('essentials community gets no violation or repair actions', () => {
    expect(ESSENTIALS.hasViolations).toBe(false);
    expect(ESSENTIALS.hasMaintenanceRequests).toBe(false);
    for (const audience of ['board', 'resident'] as const) {
      const labels = actions({ audience, features: ESSENTIALS }).map((a) => a.label);
      expect(labels).not.toContain('Report a problem');
      expect(labels).not.toContain('Ask for a repair');
      expect(labels).toContain('Find a document');
    }
  });

  it('support session drops write actions', () => {
    expect(actions({ supportSession: true, pendingSignatures: 1 }).map((a) => a.id)).toEqual(['sign']);
    expect(actions({ audience: 'board', supportSession: true }).map((a) => a.id)).toEqual(['find-document', 'update-contact']);
    expect(actions({ audience: 'resident', supportSession: true }).map((a) => a.id)).toEqual(['find-document', 'update-contact']);
  });

  it('never more than 4', () => {
    for (const audience of ['manager', 'board', 'resident'] as const) {
      expect(actions({ audience, pendingSignatures: 3 }).length).toBeLessThanOrEqual(4);
    }
  });

  it('sign label pluralizes and targets #documents-to-sign', () => {
    const one = actions({ pendingSignatures: 1 }).find((a) => a.id === 'sign');
    const many = actions({ pendingSignatures: 5 }).find((a) => a.id === 'sign');
    expect([one?.label, one?.href]).toEqual(['Sign 1 document', '#documents-to-sign']);
    expect(many?.label).toBe('Sign 5 documents');
    expect(actions({ pendingSignatures: 0 }).some((a) => a.id === 'sign')).toBe(false);
  });
});

const meetings = (n: number): CalendarMeetingRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title: `M${i}`,
    meetingType: 'board',
    startsAt: new Date('2026-11-10T20:00:00Z'),
    endsAt: null,
    location: 'x',
    noticePostedAt: null,
  }));

const tiles = (over: Partial<Parameters<typeof buildMetricTiles>[0]> = {}) =>
  buildMetricTiles({
    audience: 'manager',
    features: PRO,
    violationOpenCount: 3,
    openMaintenanceCount: 5,
    meetings30d: meetings(2),
    communityId: CID,
    timeZone: 'America/New_York',
    ...over,
  });

describe('buildMetricTiles', () => {
  it('manager sees violations, maintenance and meetings, in order', () => {
    expect(tiles().map((t) => [t.id, t.value, t.href])).toEqual([
      ['violations', '3', '/violations?communityId=7'],
      ['maintenance', '5', '/maintenance?communityId=7'],
      ['meetings', '2', '/meetings?communityId=7'],
    ]);
  });

  it('tenant gets no maintenance tile', () => {
    expect(tiles({ audience: 'resident' }).map((t) => t.id)).toEqual(['violations', 'meetings']);
  });

  it('residents link the violations tile to the report page', () => {
    expect(tiles({ audience: 'resident' })[0]?.href).toBe('/violations/report?communityId=7');
  });

  it('board seat sees the maintenance tile and the violations list', () => {
    expect(tiles({ audience: 'board' }).map((t) => [t.id, t.href])).toEqual([
      ['violations', '/violations?communityId=7'],
      ['maintenance', '/maintenance?communityId=7'],
      ['meetings', '/meetings?communityId=7'],
    ]);
  });

  it('essentials owner sees no violations tile, and a null count hides it too', () => {
    expect(tiles({ audience: 'resident', features: ESSENTIALS }).map((t) => t.id)).toEqual(['meetings']);
    expect(tiles({ violationOpenCount: null }).map((t) => t.id)).not.toContain('violations');
  });

  it('zero is a value, not a missing tile', () => {
    expect(tiles({ violationOpenCount: 0, meetings30d: [] }).map((t) => t.value)).toEqual(['0', '5', '0']);
  });
});
