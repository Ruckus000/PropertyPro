import { describe, expect, it } from 'vitest';
import { signupSchema } from './signup-schema';

const baseSignupPayload = {
  primaryContactName: 'Alex Morgan',
  email: 'alex@example.com',
  password: 'TestPassw0rd!',
  communityName: 'Sunset Condos',
  county: 'Palm Beach',
  unitCount: 24,
  communityType: 'condo_718' as const,
  planKey: 'essentials' as const,
  candidateSlug: 'sunset-condos',
  termsAccepted: true,
};

describe('signupSchema address normalization', () => {
  it('accepts legacy address payloads and normalizes them into addressLine1', () => {
    const result = signupSchema.parse({
      ...baseSignupPayload,
      address: '123 Legacy Lane',
    });

    expect(result.address).toBe('123 Legacy Lane');
    expect(result.addressLine1).toBe('123 Legacy Lane');
    expect(result.city).toBe('');
    expect(result.state).toBe('');
    expect(result.zipCode).toBe('');
  });

  it('accepts structured address payloads and dual-writes the legacy address field', () => {
    const result = signupSchema.parse({
      ...baseSignupPayload,
      addressLine1: '123 Main Street',
      city: 'Boca Raton',
      state: 'fl',
      zipCode: '33432',
    });

    expect(result.address).toBe('123 Main Street');
    expect(result.addressLine1).toBe('123 Main Street');
    expect(result.city).toBe('Boca Raton');
    expect(result.state).toBe('FL');
    expect(result.zipCode).toBe('33432');
  });
});
