import { describe, expect, it } from 'vitest';
import { signupRemainingSteps } from '@/lib/auth/signup-remaining-steps';

describe('signupRemainingSteps', () => {
  it('names a known plan', () => {
    expect(signupRemainingSteps('operations_plus')[0]).toEqual({ label: 'Checkout', value: expect.stringMatching(/ plan$/) });
  });

  it('never echoes an unrecognised stored plan key into the email', () => {
    const steps = signupRemainingSteps('mystery_tier');
    expect(JSON.stringify(steps)).not.toContain('mystery_tier');
    expect(steps[0]).toEqual({ label: 'Checkout', value: 'Next, after you verify' });
  });

  it('handles a missing plan key', () => {
    expect(signupRemainingSteps(null)).toHaveLength(2);
  });
});
