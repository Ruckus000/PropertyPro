import { describe, expect, it } from 'vitest';
import {
  SIGNUP_TRIAL_DAYS,
  signupTrialMarketingLine,
  signupTrialHeroBullet,
} from '../billing/signup-trial';

describe('signup trial constants', () => {
  it('is 30 days for Public GA', () => {
    expect(SIGNUP_TRIAL_DAYS).toBe(30);
  });

  it('marketing line states card required and omits no-card claims', () => {
    const line = signupTrialMarketingLine();
    expect(line).toMatch(/30-day/i);
    expect(line).toMatch(/card required/i);
    expect(line.toLowerCase()).not.toContain('no card');
  });

  it('hero bullet is short and truthful', () => {
    expect(signupTrialHeroBullet()).toMatch(/30-day/i);
    expect(signupTrialHeroBullet().toLowerCase()).not.toContain('no card');
  });
});
