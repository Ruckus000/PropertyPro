import { describe, expect, it } from 'vitest';
import {
  normalizeWizardStepData,
  normalizeWizardStepPatch,
} from '@/lib/onboarding/apartment-wizard-types';

describe('apartment wizard type normalization', () => {
  it('preserves explicit invite null in persisted wizard state', () => {
    expect(normalizeWizardStepData({ invite: null })).toEqual({
      branding: undefined,
      completionMarkers: undefined,
      invite: null,
      profile: undefined,
      rules: undefined,
      units: undefined,
    });
  });

  it('preserves explicit invite null in step patches', () => {
    expect(normalizeWizardStepPatch({ invite: null })).toEqual({
      invite: null,
    });
  });
});
