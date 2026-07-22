/**
 * Pure-function tests for the insurance-alerts building blocks:
 *  - master-policy expiry banding + the once-per-band dedupe,
 *  - the signed no-login unsubscribe token (sign/verify/tamper),
 *  - the CAN-SPAM postal-address formatter (incomplete address ⇒ null).
 *
 * The full send orchestration is covered in insurance-alert-processor.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';

// The processor module (for formatCommunityPostalAddress) pulls in @propertypro/db
// (DATABASE_URL load guard) and the token helper needs its secret. Neither is
// actually connected/used by the pure functions under test.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.INSURANCE_ALERTS_UNSUBSCRIBE_SECRET ??= 'test-insurance-unsub-secret';
});

import {
  classifyInsurancePolicyExpiry,
  shouldSendInsurancePolicyAlert,
} from '../../src/lib/services/insurance-policy-expiry';
import {
  signInsuranceAlertUnsubscribeToken,
  verifyInsuranceAlertUnsubscribeToken,
} from '../../src/lib/services/insurance-alert-unsubscribe-token';
import { formatCommunityPostalAddress } from '../../src/lib/services/insurance-alert-processor';

const REFERENCE = new Date('2026-07-18T12:00:00.000Z');

describe('classifyInsurancePolicyExpiry', () => {
  it('bands a far-future policy as none', () => {
    expect(classifyInsurancePolicyExpiry('2027-01-01', REFERENCE).band).toBe('none');
  });
  it('bands within 60 days as 60_days', () => {
    expect(classifyInsurancePolicyExpiry('2026-09-01', REFERENCE).band).toBe('60_days');
  });
  it('bands within 30 days as 30_days', () => {
    expect(classifyInsurancePolicyExpiry('2026-08-10', REFERENCE).band).toBe('30_days');
  });
  it('bands a past date as expired with negative days', () => {
    const { band, daysUntilExpiry } = classifyInsurancePolicyExpiry('2026-07-10', REFERENCE);
    expect(band).toBe('expired');
    expect(daysUntilExpiry).toBeLessThan(0);
  });
  it('treats the 60-day boundary as 60_days and 61 as none', () => {
    expect(classifyInsurancePolicyExpiry('2026-09-16', REFERENCE).band).toBe('60_days'); // 60 days
    expect(classifyInsurancePolicyExpiry('2026-09-17', REFERENCE).band).toBe('none'); // 61 days
  });
});

describe('shouldSendInsurancePolicyAlert (rank-based dedupe)', () => {
  it('fires on first entry into a band (null lastAlertBand)', () => {
    expect(shouldSendInsurancePolicyAlert('60_days', null)).toBe(true);
    expect(shouldSendInsurancePolicyAlert('expired', null)).toBe(true);
  });
  it('does not re-fire the same band', () => {
    expect(shouldSendInsurancePolicyAlert('60_days', '60_days')).toBe(false);
  });
  it('fires a narrower band after a wider one already went out', () => {
    expect(shouldSendInsurancePolicyAlert('30_days', '60_days')).toBe(true);
    expect(shouldSendInsurancePolicyAlert('expired', '30_days')).toBe(true);
  });
  it('never fires for the none band', () => {
    expect(shouldSendInsurancePolicyAlert('none', null)).toBe(false);
  });
});

describe('insurance-alert unsubscribe token', () => {
  it('round-trips a valid token', () => {
    const token = signInsuranceAlertUnsubscribeToken({ communityId: 7, userId: 'user-xyz' });
    expect(verifyInsuranceAlertUnsubscribeToken(token)).toEqual({ communityId: 7, userId: 'user-xyz' });
  });
  it('rejects a tampered payload', () => {
    const token = signInsuranceAlertUnsubscribeToken({ communityId: 7, userId: 'user-xyz' });
    const [, sig] = token.split('.');
    const forged = Buffer.from('999:user-evil').toString('base64url') + '.' + sig;
    expect(verifyInsuranceAlertUnsubscribeToken(forged)).toBeNull();
  });
  it('rejects malformed tokens', () => {
    expect(verifyInsuranceAlertUnsubscribeToken('')).toBeNull();
    expect(verifyInsuranceAlertUnsubscribeToken('no-dot')).toBeNull();
    expect(verifyInsuranceAlertUnsubscribeToken('.sig')).toBeNull();
  });
});

describe('formatCommunityPostalAddress (CAN-SPAM)', () => {
  it('builds address lines when complete', () => {
    expect(
      formatCommunityPostalAddress({
        addressLine1: '100 Ocean Dr',
        addressLine2: 'Suite 5',
        city: 'Miami',
        state: 'FL',
        zipCode: '33139',
      }),
    ).toEqual(['100 Ocean Dr', 'Suite 5', 'Miami, FL 33139']);
  });
  it('omits an absent line 2', () => {
    expect(
      formatCommunityPostalAddress({
        addressLine1: '100 Ocean Dr',
        addressLine2: null,
        city: 'Miami',
        state: 'FL',
        zipCode: '33139',
      }),
    ).toEqual(['100 Ocean Dr', 'Miami, FL 33139']);
  });
  it('returns null when any required part is missing or blank', () => {
    const base = { addressLine1: '100 Ocean Dr', addressLine2: null, city: 'Miami', state: 'FL', zipCode: '33139' };
    expect(formatCommunityPostalAddress({ ...base, addressLine1: null })).toBeNull();
    expect(formatCommunityPostalAddress({ ...base, city: '   ' })).toBeNull();
    expect(formatCommunityPostalAddress({ ...base, state: null })).toBeNull();
    expect(formatCommunityPostalAddress({ ...base, zipCode: '' })).toBeNull();
  });
});
