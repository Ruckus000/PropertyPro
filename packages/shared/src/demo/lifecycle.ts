/**
 * Demo lifecycle status computation.
 *
 * Determines where a community is in the demo lifecycle based on its
 * timestamps. Used by banner components, API guards, and cron jobs.
 */

export type DemoLifecycleStatus =
  | 'active_trial'   // now < trial_ends_at
  | 'grace_period'   // trial_ends_at <= now < demo_expires_at
  | 'converted'      // is_demo = false
  | 'expired';       // deleted_at set OR now >= demo_expires_at

export function computeDemoStatus(community: {
  isDemo: boolean;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
  deletedAt: Date | null;
}): DemoLifecycleStatus {
  if (!community.isDemo) return 'converted';
  if (community.deletedAt) return 'expired';
  const now = new Date();
  if (!community.demoExpiresAt) return 'expired';
  if (community.trialEndsAt && now < community.trialEndsAt) return 'active_trial';
  if (now < community.demoExpiresAt) return 'grace_period';
  return 'expired';
}
