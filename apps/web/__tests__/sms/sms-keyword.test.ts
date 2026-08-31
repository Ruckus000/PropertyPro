/**
 * Inbound SMS keyword handling and the STOP disclosure (TCPA).
 *
 * Two failure directions, both bad and in opposite ways:
 *   - Missing a real opt-out keeps texting someone who said stop.
 *   - Treating ordinary text as an opt-out silently cuts a resident off from
 *     emergency notices, which is the worse of the two.
 *
 * And one ordering property that is easy to get backwards: the disclosure must
 * survive truncation, not be the thing truncation removes.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */
import { describe, expect, it } from 'vitest';
import {
  SMS_MAX_LENGTH,
  STOP_DISCLOSURE,
  appendStopDisclosure,
  classifyInboundSms,
  severityRequiresStopDisclosure,
} from '@/lib/services/sms/sms-keyword';

describe('classifyInboundSms', () => {
  it.each(['STOP', 'stop', 'Stop', 'STOPALL', 'unsubscribe', 'cancel', 'end', 'quit'])(
    'treats %o as an opt-out',
    (body) => {
      expect(classifyInboundSms(body)).toBe('stop');
    },
  );

  it.each(['  stop  ', 'STOP.', '"stop"', 'stop!'])(
    'ignores surrounding whitespace and punctuation in %o',
    (body) => {
      expect(classifyInboundSms(body)).toBe('stop');
    },
  );

  it.each(['START', 'unstop', 'yes'])('treats %o as opting back in', (body) => {
    expect(classifyInboundSms(body)).toBe('start');
  });

  it.each(['HELP', 'info'])('treats %o as a help request', (body) => {
    expect(classifyInboundSms(body)).toBe('help');
  });

  it.each([
    'stop by the clubhouse at 6',
    'can you stop the noise',
    'please cancel my reservation',
    'is the pool open',
    'END OF LEASE question',
  ])('does NOT treat %o as a keyword', (body) => {
    // A message that merely CONTAINS a keyword is not an opt-out. Getting this
    // wrong disconnects a resident from hurricane notices because they asked
    // about a reservation.
    expect(classifyInboundSms(body)).toBeNull();
  });

  it.each([null, undefined, '', '   '])('returns null for %o', (body) => {
    expect(classifyInboundSms(body)).toBeNull();
  });
});

describe('appendStopDisclosure', () => {
  it('appends the disclosure to a short message', () => {
    expect(appendStopDisclosure('Pool closed Tuesday.')).toBe(
      `Pool closed Tuesday.${STOP_DISCLOSURE}`,
    );
  });

  it('KEEPS the disclosure when the body would overflow', () => {
    // The ordering property. Truncate-then-append can exceed the limit;
    // append-then-truncate cuts off the disclosure — the one part that has to
    // survive. Room is reserved first, so the message loses its own tail.
    const long = 'x'.repeat(SMS_MAX_LENGTH + 500);

    const result = appendStopDisclosure(long);

    expect(result.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
    expect(result.endsWith(STOP_DISCLOSURE)).toBe(true);
    expect(result).toContain('...');
  });

  it('is idempotent', () => {
    // The send path can be retried; a body reading "Reply STOP to opt out.
    // Reply STOP to opt out." is its own small embarrassment.
    const once = appendStopDisclosure('Notice.');
    expect(appendStopDisclosure(once)).toBe(once);
  });

  it('stays within the limit for a body exactly at the boundary', () => {
    const exact = 'y'.repeat(SMS_MAX_LENGTH);
    expect(appendStopDisclosure(exact).length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
  });
});

describe('severityRequiresStopDisclosure', () => {
  it('exempts a genuine emergency', () => {
    // TCPA's emergency-purpose exception is narrow, and this is the only
    // severity where twenty-three characters of a hurricane notice are worth
    // arguing about.
    expect(severityRequiresStopDisclosure('emergency')).toBe(false);
  });

  it.each(['urgent', 'info'])('requires it for %o', (severity) => {
    // A "pool closed for maintenance" blast is ordinary messaging no matter
    // which button a PM pressed.
    expect(severityRequiresStopDisclosure(severity)).toBe(true);
  });

  it('requires it for an UNKNOWN severity', () => {
    // Fail toward disclosure: a severity this build does not recognise is not
    // evidence that an exception applies.
    expect(severityRequiresStopDisclosure('marketing_blast')).toBe(true);
  });
});
