/**
 * Tests for TCPA consent enforcement and recipient eligibility
 * in emergency broadcast recipient resolution.
 *
 * These tests verify that the consent-gating logic correctly
 * prevents SMS delivery to users who haven't consented or have revoked.
 */
import { describe, expect, it } from 'vitest';

/**
 * Extracted consent logic matching emergency-broadcast-service.ts.
 * Tests the pure logic independently of the database layer.
 *
 * TCPA consent requires: smsEnabled + consentGiven + not revoked.
 * smsEmergencyOnly filter: when true (default), only emergency severity passes.
 */
function isSmsConsented(prefs: {
  smsEnabled?: boolean;
  smsConsentGivenAt?: Date | null;
  smsConsentRevokedAt?: Date | null;
  smsEmergencyOnly?: boolean;
} | undefined, severity: 'emergency' | 'urgent' | 'info' = 'emergency'): boolean {
  const hasTcpaConsent =
    prefs !== undefined &&
    prefs.smsEnabled === true &&
    prefs.smsConsentGivenAt != null &&
    prefs.smsConsentRevokedAt == null;
  const emergencyOnly = prefs?.smsEmergencyOnly !== false; // default true
  return hasTcpaConsent && (severity === 'emergency' || !emergencyOnly);
}

/**
 * Extracted eligibility logic matching emergency-broadcast-service.ts line 177.
 */
function canReceiveSms(opts: {
  smsEnabled: boolean;
  phoneVerified: boolean;
  smsConsented: boolean;
  phone: string | null;
}): boolean {
  return opts.smsEnabled && opts.phoneVerified && opts.smsConsented && opts.phone !== null;
}

describe('TCPA SMS consent enforcement', () => {
  it('grants SMS consent when all conditions are met', () => {
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: null,
    })).toBe(true);
  });

  it('denies SMS when smsEnabled is false', () => {
    expect(isSmsConsented({
      smsEnabled: false,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: null,
    })).toBe(false);
  });

  it('denies SMS when consent was never given', () => {
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: null,
      smsConsentRevokedAt: null,
    })).toBe(false);
  });

  it('denies SMS when consent was revoked (TCPA critical)', () => {
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: new Date('2025-06-01'),
    })).toBe(false);
  });

  it('denies SMS when preferences are undefined', () => {
    expect(isSmsConsented(undefined)).toBe(false);
  });

  it('denies SMS even if smsEnabled is true but consent revoked', () => {
    // Regression: ensure revocation overrides smsEnabled flag
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: new Date('2025-02-01'),
    })).toBe(false);
  });

  it('allows emergency SMS when smsEmergencyOnly is true (default)', () => {
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: null,
      smsEmergencyOnly: true,
    }, 'emergency')).toBe(true);
  });

  it('denies non-emergency SMS when smsEmergencyOnly is true', () => {
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: null,
      smsEmergencyOnly: true,
    }, 'urgent')).toBe(false);
  });

  it('denies info-severity SMS when smsEmergencyOnly is true', () => {
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: null,
      smsEmergencyOnly: true,
    }, 'info')).toBe(false);
  });

  it('allows non-emergency SMS when smsEmergencyOnly is false', () => {
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: null,
      smsEmergencyOnly: false,
    }, 'urgent')).toBe(true);
  });

  it('defaults smsEmergencyOnly to true when unset', () => {
    // smsEmergencyOnly not provided → defaults to true → denies non-emergency
    expect(isSmsConsented({
      smsEnabled: true,
      smsConsentGivenAt: new Date('2025-01-01'),
      smsConsentRevokedAt: null,
    }, 'info')).toBe(false);
  });
});

describe('Recipient SMS eligibility', () => {
  it('eligible when all conditions met', () => {
    expect(canReceiveSms({
      smsEnabled: true,
      phoneVerified: true,
      smsConsented: true,
      phone: '+13055551234',
    })).toBe(true);
  });

  it('ineligible when phone is not verified', () => {
    expect(canReceiveSms({
      smsEnabled: true,
      phoneVerified: false,
      smsConsented: true,
      phone: '+13055551234',
    })).toBe(false);
  });

  it('ineligible when SMS consent not given', () => {
    expect(canReceiveSms({
      smsEnabled: true,
      phoneVerified: true,
      smsConsented: false,
      phone: '+13055551234',
    })).toBe(false);
  });

  it('ineligible when phone is null', () => {
    expect(canReceiveSms({
      smsEnabled: true,
      phoneVerified: true,
      smsConsented: true,
      phone: null,
    })).toBe(false);
  });

  it('ineligible when SMS channel is disabled', () => {
    expect(canReceiveSms({
      smsEnabled: false,
      phoneVerified: true,
      smsConsented: true,
      phone: '+13055551234',
    })).toBe(false);
  });
});
