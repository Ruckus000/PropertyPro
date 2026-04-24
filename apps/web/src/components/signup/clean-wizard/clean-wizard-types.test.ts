import { describe, expect, it } from 'vitest';
import { fieldToStepIndex } from './clean-wizard-types';

describe('fieldToStepIndex', () => {
  it('maps account fields to step 0', () => {
    expect(fieldToStepIndex('email')).toBe(0);
    expect(fieldToStepIndex('password')).toBe(0);
    expect(fieldToStepIndex('adminType')).toBe(0);
    expect(fieldToStepIndex('primaryContactName')).toBe(0);
  });

  it('maps address and community fields to step 1', () => {
    expect(fieldToStepIndex('addressLine1')).toBe(1);
    expect(fieldToStepIndex('communityName')).toBe(1);
    expect(fieldToStepIndex('county')).toBe(1);
    expect(fieldToStepIndex('unitCount')).toBe(1);
    expect(fieldToStepIndex('communityType')).toBe(1);
  });

  it('maps plan to step 2', () => {
    expect(fieldToStepIndex('planKey')).toBe(2);
  });

  it('maps finish fields to step 3', () => {
    expect(fieldToStepIndex('candidateSlug')).toBe(3);
    expect(fieldToStepIndex('termsAccepted')).toBe(3);
  });
});
