/** Stripe Checkout trial length for self-serve signup (Public GA). */
export const SIGNUP_TRIAL_DAYS = 30 as const;

/** Pricing-section subcopy — must stay aligned with Stripe Checkout. */
export function signupTrialMarketingLine(): string {
  return `${SIGNUP_TRIAL_DAYS}-day free trial; card required to start.`;
}

/** Hero checklist bullet. */
export function signupTrialHeroBullet(): string {
  return `${SIGNUP_TRIAL_DAYS}-day free trial`;
}
