import { describe, expect, it } from 'vitest';
import {
  broadcastStatus,
  formatDateTimeWithZone,
  formatScheduledTime,
  sendOutcomeReasonText,
  timeZoneLabel,
} from '@/components/emergency/broadcast-status';

const T = '2026-03-02T02:30:00.000Z';
const NONE = {
  canceledAt: null,
  completedAt: null,
  scheduledFor: null,
  sendClaimedAt: null,
  sendOutcome: null,
};

describe('broadcastStatus', () => {
  it('reads each state on its own', () => {
    expect(broadcastStatus(NONE)).toEqual({ kind: 'in-progress', word: 'Draft' });
    expect(broadcastStatus(NONE, { unsentWord: 'Pending' }).word).toBe('Pending');
    expect(broadcastStatus({ ...NONE, scheduledFor: T })).toEqual({ kind: 'not-started', word: 'Scheduled' });
    expect(broadcastStatus({ ...NONE, scheduledFor: T, sendClaimedAt: T })).toEqual({
      kind: 'in-progress',
      word: 'Sending',
    });
    expect(broadcastStatus({ ...NONE, scheduledFor: T, sendClaimedAt: T, sendOutcome: 'missed' })).toEqual({
      kind: 'overdue',
      word: 'Missed',
    });
    expect(broadcastStatus({ ...NONE, scheduledFor: T, sendClaimedAt: T, sendOutcome: 'failed' })).toEqual({
      kind: 'overdue',
      word: 'Did not send',
    });
    expect(broadcastStatus({ ...NONE, completedAt: T })).toEqual({ kind: 'done', word: 'Sent' });
    expect(broadcastStatus({ ...NONE, canceledAt: T })).toEqual({ kind: 'not-started', word: 'Canceled' });
  });

  it('a resident row, which carries no scheduling fields, still reads Sent or Draft', () => {
    expect(broadcastStatus({ canceledAt: null, completedAt: T }).word).toBe('Sent');
    expect(broadcastStatus({ canceledAt: null, completedAt: null }).word).toBe('Draft');
  });

  it('precedence: Canceled, Sent, Missed, Did not send, Sending, Scheduled, Draft', () => {
    const everything = {
      canceledAt: T,
      completedAt: T,
      scheduledFor: T,
      sendClaimedAt: T,
      sendOutcome: 'missed',
    };
    expect(broadcastStatus(everything).word).toBe('Canceled');
    expect(broadcastStatus({ ...everything, canceledAt: null }).word).toBe('Sent');
    expect(broadcastStatus({ ...everything, canceledAt: null, completedAt: null }).word).toBe('Missed');
    expect(
      broadcastStatus({ ...everything, canceledAt: null, completedAt: null, sendOutcome: 'failed' }).word,
    ).toBe('Did not send');
    expect(
      broadcastStatus({ ...everything, canceledAt: null, completedAt: null, sendOutcome: null }).word,
    ).toBe('Sending');
    expect(
      broadcastStatus({
        ...everything,
        canceledAt: null,
        completedAt: null,
        sendOutcome: null,
        sendClaimedAt: null,
      }).word,
    ).toBe('Scheduled');
    // A scheduled alert never reads Draft or Pending, whatever word the page asks for.
    expect(broadcastStatus({ ...NONE, scheduledFor: T }, { unsentWord: 'Pending' }).word).toBe('Scheduled');
  });

  it('the two problem states take the problem mark; Scheduled and Sending do not read as done', () => {
    expect(broadcastStatus({ ...NONE, sendOutcome: 'missed' }).kind).toBe('overdue');
    expect(broadcastStatus({ ...NONE, sendOutcome: 'failed' }).kind).toBe('overdue');
    expect(broadcastStatus({ ...NONE, scheduledFor: T }).kind).not.toBe('done');
    expect(broadcastStatus({ ...NONE, scheduledFor: T, sendClaimedAt: T }).kind).not.toBe('done');
  });
});

describe('sendOutcomeReasonText', () => {
  it('puts each machine reason in plain words', () => {
    expect(sendOutcomeReasonText('late')).toBe('The send time passed while the system was unavailable.');
    expect(sendOutcomeReasonText('community_deleted')).toBe('The community was deleted before the send time.');
    expect(sendOutcomeReasonText('interrupted')).toBe('Sending was interrupted before it finished.');
    expect(sendOutcomeReasonText('no_recipients')).toBe('Nobody was in the audience at the send time.');
    expect(sendOutcomeReasonText('send_error')).toBe('Something went wrong while sending.');
  });

  it('never prints an error class name', () => {
    for (const reason of ['EmailProviderDownError', 'TypeError', 'UnknownError', '', null, undefined]) {
      expect(sendOutcomeReasonText(reason)).toBe('Something went wrong while sending.');
    }
  });
});

describe('zone formatting', () => {
  it('formats an instant with the zone abbreviation, on both sides of a DST change', () => {
    expect(formatDateTimeWithZone('2026-03-07T14:00:00.000Z', 'America/New_York')).toBe(
      'Sat, Mar 7, 2026, 9:00 AM EST',
    );
    expect(formatDateTimeWithZone('2026-03-09T13:00:00.000Z', 'America/New_York')).toBe(
      'Mon, Mar 9, 2026, 9:00 AM EDT',
    );
  });

  it('a scheduled time always carries its zone abbreviation', () => {
    expect(formatScheduledTime('2026-03-07T14:00:00.000Z', 'America/New_York')).toBe('Mar 7, 2026, 9:00 AM EST');
    expect(formatScheduledTime('2026-03-09T13:00:00.000Z', 'America/New_York')).toBe('Mar 9, 2026, 9:00 AM EDT');
    expect(formatScheduledTime('2026-03-09T13:00:00.000Z', 'America/Chicago')).toBe('Mar 9, 2026, 8:00 AM CDT');
  });

  it('names the zone in everyday words with its identifier', () => {
    expect(timeZoneLabel('America/New_York')).toBe('Eastern Time (America/New_York)');
    expect(timeZoneLabel('America/Chicago')).toBe('Central Time (America/Chicago)');
  });
});
