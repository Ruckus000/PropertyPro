import { describe, expect, it } from 'vitest';
import { resolvePendingSignupAddress } from './provisioning-address';

describe('resolvePendingSignupAddress', () => {
  it('falls back to the legacy address field for older pending signup rows', () => {
    expect(resolvePendingSignupAddress({
      address: '123 Legacy Lane',
      addressLine1: null,
      city: null,
      state: null,
      zipCode: null,
    })).toEqual({
      addressLine1: '123 Legacy Lane',
      city: null,
      state: null,
      zipCode: null,
    });
  });

  it('prefers structured fields when they exist on the pending signup row', () => {
    expect(resolvePendingSignupAddress({
      address: '123 Main Street',
      addressLine1: '123 Main Street',
      city: 'Boca Raton',
      state: 'FL',
      zipCode: '33432',
    })).toEqual({
      addressLine1: '123 Main Street',
      city: 'Boca Raton',
      state: 'FL',
      zipCode: '33432',
    });
  });
});
