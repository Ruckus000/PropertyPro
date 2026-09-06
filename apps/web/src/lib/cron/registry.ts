/**
 * The scheduled jobs, and what "healthy" means for each.
 *
 * ## Why a hand-maintained registry rather than reading `vercel.json`
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * `vercel.json` gives a crontab expression; deciding "is this job overdue?"
 * from one needs a crontab parser, which is a dependency for something a
 * human can state in a number.
 *
 * More importantly, the right staleness window is a *judgement*, not the
 * schedule interval. A job that runs every five minutes is not broken because
 * it missed one tick; a job that runs monthly is very broken after five weeks.
 * `maxAgeMinutes` is that judgement, written down per job, and it is
 * deliberately generous — a health probe that cries wolf gets muted, and a
 * muted probe is the state this whole effort exists to leave.
 *
 * `pnpm guard:cron-job-tagging` reconciles this file against `vercel.json` in
 * BOTH directions, so drift fails the build rather than silently un-monitoring
 * a job.
 */

/**
 * Slug = the path after `/api/v1/internal/`, with `/` replaced by `-`.
 *
 * Derived from the path rather than the leaf folder because one job is nested:
 * `notification-digests/process`'s leaf is `process`, which names nothing.
 * For every other job this is identical to the folder name, so the existing
 * `job: 'community-export-worker'` tag values in
 * `community-export-worker/route.ts` keep their exact meaning.
 */
export type CronJobSlug =
  | 'account-lifecycle'
  | 'assessment-overdue'
  | 'calendar-event-reminders'
  | 'community-export-worker'
  | 'compliance-alerts'
  | 'coupon-sync-retry'
  | 'expire-demos'
  | 'generate-assessments'
  | 'insurance-alerts'
  | 'late-fee-processor'
  | 'notification-digests-process'
  | 'payment-reminders'
  | 'provisioning-watchdog'
  | 'revenue-snapshot'
  | 'scheduled-site-publish'
  | 'snowbird-digest'
  | 'visitor-auto-checkout';

export interface CronJobDefinition {
  /** Must match a `crons[].path` in `apps/web/vercel.json` exactly. */
  path: string;
  /** Must match that entry's `schedule` exactly. Mirrored so drift is visible. */
  schedule: string;
  /**
   * How long after its last SUCCESS a job is considered stale.
   *
   * Must exceed the schedule's own interval, or the job would be permanently
   * overdue by construction — asserted by the guard.
   */
  maxAgeMinutes: number;
}

/** Grace windows, by cadence — so the numbers below are not arbitrary. */
const EVERY_5_MIN = 20;
const EVERY_15_MIN = 45;
const HOURLY = 180; // 3h: two missed hours is a problem, one is a blip
const DAILY = 1800; // 30h, matching revenue-snapshot/health's 26h precedent
const MONTHLY = 46080; // 32d: a 31-day month plus a day of slack

export const CRON_JOBS: Record<CronJobSlug, CronJobDefinition> = {
  'account-lifecycle': {
    path: '/api/v1/internal/account-lifecycle',
    schedule: '0 4 * * *',
    maxAgeMinutes: DAILY,
  },
  'assessment-overdue': {
    path: '/api/v1/internal/assessment-overdue',
    schedule: '0 6 * * *',
    maxAgeMinutes: DAILY,
  },
  'calendar-event-reminders': {
    path: '/api/v1/internal/calendar-event-reminders',
    schedule: '*/15 * * * *',
    maxAgeMinutes: EVERY_15_MIN,
  },
  'community-export-worker': {
    path: '/api/v1/internal/community-export-worker',
    schedule: '*/5 * * * *',
    maxAgeMinutes: EVERY_5_MIN,
  },
  'compliance-alerts': {
    path: '/api/v1/internal/compliance-alerts',
    schedule: '30 7 * * *',
    maxAgeMinutes: DAILY,
  },
  'coupon-sync-retry': {
    path: '/api/v1/internal/coupon-sync-retry',
    schedule: '15 5 * * *',
    maxAgeMinutes: DAILY,
  },
  'expire-demos': {
    path: '/api/v1/internal/expire-demos',
    schedule: '0 3 * * *',
    maxAgeMinutes: DAILY,
  },
  'generate-assessments': {
    path: '/api/v1/internal/generate-assessments',
    schedule: '0 5 1 * *',
    maxAgeMinutes: MONTHLY,
  },
  'insurance-alerts': {
    path: '/api/v1/internal/insurance-alerts',
    schedule: '10 13 * * *',
    maxAgeMinutes: DAILY,
  },
  'late-fee-processor': {
    path: '/api/v1/internal/late-fee-processor',
    schedule: '0 7 * * *',
    maxAgeMinutes: DAILY,
  },
  'notification-digests-process': {
    path: '/api/v1/internal/notification-digests/process',
    schedule: '*/15 * * * *',
    maxAgeMinutes: EVERY_15_MIN,
  },
  'payment-reminders': {
    path: '/api/v1/internal/payment-reminders',
    schedule: '0 0 * * *',
    maxAgeMinutes: DAILY,
  },
  'provisioning-watchdog': {
    path: '/api/v1/internal/provisioning-watchdog',
    schedule: '15 * * * *',
    maxAgeMinutes: HOURLY,
  },
  'revenue-snapshot': {
    path: '/api/v1/internal/revenue-snapshot',
    schedule: '0 2 * * *',
    maxAgeMinutes: DAILY,
  },
  'scheduled-site-publish': {
    path: '/api/v1/internal/scheduled-site-publish',
    schedule: '5,20,35,50 * * * *',
    maxAgeMinutes: EVERY_15_MIN,
  },
  'snowbird-digest': {
    path: '/api/v1/internal/snowbird-digest',
    schedule: '5 * * * *',
    maxAgeMinutes: HOURLY,
  },
  'visitor-auto-checkout': {
    path: '/api/v1/internal/visitor-auto-checkout',
    schedule: '0 * * * *',
    maxAgeMinutes: HOURLY,
  },
};

export const CRON_JOB_SLUGS = Object.keys(CRON_JOBS) as CronJobSlug[];

/** The registry entry whose `path` matches, or undefined. Used by the guard. */
export function cronJobForPath(path: string): CronJobSlug | undefined {
  return CRON_JOB_SLUGS.find((slug) => CRON_JOBS[slug].path === path);
}
