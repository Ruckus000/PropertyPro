import { describe, expect, it } from 'vitest';
import {
  normalizeSignupSubdomain,
  signupDetailsSchema,
  signupStartSchema,
} from '../../src/lib/auth/signup-schema';

const validPayload = {
  primaryContactName: 'Jordan Admin',
  communityName: 'Ocean Breeze HOA',
  addressLine1: '123 Palm Ave',
  city: 'West Palm Beach',
  state: 'FL',
  zipCode: '33401',
  county: 'Palm Beach',
  unitCount: 120,
  communityType: 'hoa_720' as const,
  planKey: 'essentials' as const,
  candidateSlug: 'ocean-breeze-hoa',
  termsAccepted: true,
};

describe('signup details schema validation', () => {
  it('requires all core fields', () => {
    const result = signupDetailsSchema.safeParse({});
    expect(result.success).toBe(false);

    if (result.success) return;
    const errors = result.error.flatten().fieldErrors;
    expect(errors.primaryContactName?.length).toBeGreaterThan(0);
    expect(errors.communityName?.length).toBeGreaterThan(0);
    expect(errors.county?.length).toBeGreaterThan(0);
    expect(errors.unitCount?.length).toBeGreaterThan(0);
    expect(errors.communityType?.length).toBeGreaterThan(0);
    expect(errors.planKey?.length).toBeGreaterThan(0);
    expect(errors.candidateSlug?.length).toBeGreaterThan(0);
    expect(errors.termsAccepted?.length).toBeGreaterThan(0);
  });

  it('requires an address when neither legacy nor structured address fields are provided', () => {
    const result = signupDetailsSchema.safeParse({
      ...validPayload,
      addressLine1: undefined,
      city: undefined,
      state: undefined,
      zipCode: undefined,
    });
    expect(result.success).toBe(false);

    if (result.success) return;
    const errors = result.error.flatten().fieldErrors;
    expect(errors.address?.length).toBeGreaterThan(0);
  });

  it('routes the missing-address error to addressLine1 when the structured form submits blank strings', () => {
    // The signup flow always passes addressLine1/city/state/zipCode as strings
    // (initialized to ''). An empty submission routes to `addressLine1` so the
    // inline error under the street address field renders.
    const result = signupDetailsSchema.safeParse({
      ...validPayload,
      addressLine1: '',
      city: '',
      state: '',
      zipCode: '',
    });
    expect(result.success).toBe(false);

    if (result.success) return;
    const errors = result.error.flatten().fieldErrors;
    expect(errors.addressLine1?.length).toBeGreaterThan(0);
    expect(errors.address).toBeUndefined();
  });

  it('requires Terms acceptance', () => {
    const result = signupDetailsSchema.safeParse({
      ...validPayload,
      termsAccepted: false,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a fully compliant payload', () => {
    const result = signupDetailsSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects invalid emails at the start step', () => {
    const result = signupStartSchema.safeParse({ email: 'not-an-email', binding: 'a'.repeat(64) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.email?.length).toBeGreaterThan(0);
  });

  it('rejects invalid unit counts', () => {
    const result = signupDetailsSchema.safeParse({
      ...validPayload,
      unitCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('normalizeSignupSubdomain', () => {
  it('collapses consecutive hyphens', () => {
    expect(normalizeSignupSubdomain('foo--bar')).toBe('foo-bar');
    expect(normalizeSignupSubdomain('a---b---c')).toBe('a-b-c');
  });

  it('strips leading and trailing hyphens', () => {
    expect(normalizeSignupSubdomain('-hello-world-')).toBe('hello-world');
  });

  it('lowercases and replaces non-alphanumeric characters', () => {
    expect(normalizeSignupSubdomain('My Community!')).toBe('my-community');
  });
});
