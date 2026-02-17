import { describe, expect, it } from 'vitest';
import { signupSchema } from '../../src/lib/auth/signup-schema';

const validPayload = {
  primaryContactName: 'Jordan Admin',
  email: 'jordan@example.com',
  password: 'Secure!123',
  communityName: 'Ocean Breeze HOA',
  address: '123 Palm Ave, West Palm Beach, FL 33401',
  county: 'Palm Beach',
  unitCount: 120,
  communityType: 'hoa_720' as const,
  planKey: 'compliance_basic' as const,
  candidateSlug: 'ocean-breeze-hoa',
  termsAccepted: true,
};

describe('signup schema validation', () => {
  it('requires all core fields', () => {
    const result = signupSchema.safeParse({});
    expect(result.success).toBe(false);

    if (result.success) return;
    const errors = result.error.flatten().fieldErrors;
    expect(errors.primaryContactName?.length).toBeGreaterThan(0);
    expect(errors.email?.length).toBeGreaterThan(0);
    expect(errors.password?.length).toBeGreaterThan(0);
    expect(errors.communityName?.length).toBeGreaterThan(0);
    expect(errors.address?.length).toBeGreaterThan(0);
    expect(errors.county?.length).toBeGreaterThan(0);
    expect(errors.unitCount?.length).toBeGreaterThan(0);
    expect(errors.communityType?.length).toBeGreaterThan(0);
    expect(errors.planKey?.length).toBeGreaterThan(0);
    expect(errors.candidateSlug?.length).toBeGreaterThan(0);
    expect(errors.termsAccepted?.length).toBeGreaterThan(0);
  });

  it('requires Terms acceptance', () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      termsAccepted: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects weak passwords', () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid emails', () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid unit counts', () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      unitCount: 0,
    });
    expect(result.success).toBe(false);
  });
});
