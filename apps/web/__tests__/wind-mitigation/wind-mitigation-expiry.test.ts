/**
 * Unit tests for wind-mitigation expiry banding.
 *
 * These back two consumers: the badge shown to owners, and the alert cron's
 * band-transition detection (the `lastAlertBand` dedupe). The boundary cases
 * are the point — an off-by-one here either spams a board or silently skips
 * the alert that prompts a re-inspection.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyWindMitigationExpiry,
  shouldSendWindMitigationAlert,
  windMitigationEscalationTier,
} from '../../src/lib/services/wind-mitigation-expiry';

const REFERENCE = new Date('2026-07-17T12:00:00.000Z');

describe('classifyWindMitigationExpiry', () => {
  it('bands a far-future expiry as none', () => {
    const { band, daysUntilExpiry } = classifyWindMitigationExpiry('2031-01-10', REFERENCE);
    expect(band).toBe('none');
    expect(daysUntilExpiry).toBeGreaterThan(180);
  });

  it('bands a past expiry as expired with negative days', () => {
    const { band, daysUntilExpiry } = classifyWindMitigationExpiry('2026-07-16', REFERENCE);
    expect(band).toBe('expired');
    expect(daysUntilExpiry).toBe(-1);
  });

  it('treats same-day expiry as still valid (30_days), not expired', () => {
    // A form expiring today is valid today — banding must not shade it early.
    const { band, daysUntilExpiry } = classifyWindMitigationExpiry('2026-07-17', REFERENCE);
    expect(band).toBe('30_days');
    expect(daysUntilExpiry).toBe(0);
  });

  describe('boundaries', () => {
    // Each band is inclusive of its upper bound; the next day belongs to the
    // wider band.
    it.each([
      ['2026-08-16', 30, '30_days'],
      ['2026-08-17', 31, '90_days'],
      ['2026-10-15', 90, '90_days'],
      ['2026-10-16', 91, '180_days'],
      ['2027-01-13', 180, '180_days'],
      ['2027-01-14', 181, 'none'],
    ])('%s (%i days out) → %s', (date, expectedDays, expectedBand) => {
      const { band, daysUntilExpiry } = classifyWindMitigationExpiry(date as string, REFERENCE);
      expect(daysUntilExpiry).toBe(expectedDays);
      expect(band).toBe(expectedBand);
    });
  });

  it('uses calendar days, so a leap day does not shift the band', () => {
    const leapReference = new Date('2028-02-28T12:00:00.000Z');
    const { daysUntilExpiry } = classifyWindMitigationExpiry('2028-03-01', leapReference);
    expect(daysUntilExpiry).toBe(2); // Feb 29 exists in 2028
  });
});

describe('windMitigationEscalationTier', () => {
  it.each([
    ['expired', 'critical'],
    ['30_days', 'urgent'],
    ['90_days', 'urgent'],
    ['180_days', 'aware'],
    ['none', 'calm'],
  ])('%s → %s', (band, tier) => {
    expect(windMitigationEscalationTier(band as never)).toBe(tier);
  });
});

describe('shouldSendWindMitigationAlert', () => {
  it('sends the first alert when the board has never been alerted', () => {
    expect(shouldSendWindMitigationAlert('180_days', null)).toBe(true);
  });

  it('does not re-send for the same band', () => {
    expect(shouldSendWindMitigationAlert('180_days', '180_days')).toBe(false);
    expect(shouldSendWindMitigationAlert('30_days', '30_days')).toBe(false);
  });

  it('sends as the band narrows', () => {
    expect(shouldSendWindMitigationAlert('30_days', '180_days')).toBe(true);
    expect(shouldSendWindMitigationAlert('expired', '30_days')).toBe(true);
  });

  it('never re-sends for a widening band (a reset clears lastAlertBand instead)', () => {
    expect(shouldSendWindMitigationAlert('180_days', '30_days')).toBe(false);
    expect(shouldSendWindMitigationAlert('30_days', 'expired')).toBe(false);
  });

  // 90_days renders as urgent in the UI but deliberately earns no email:
  // three emails per 5-year form is the ceiling before boards tune them out.
  it('does not alert on non-alertable bands', () => {
    expect(shouldSendWindMitigationAlert('90_days', null)).toBe(false);
    expect(shouldSendWindMitigationAlert('none', null)).toBe(false);
  });

  it('still fires the expired alert when 180_days was the last alert', () => {
    // A board that ignored the 180-day notice must still hear about expiry.
    expect(shouldSendWindMitigationAlert('expired', '180_days')).toBe(true);
  });
});
