/**
 * POST /api/v1/internal/inbox-spam-scan
 *
 * Hourly: rebuild the support-inbox spam classifier from the operator's own
 * triage labels, re-score the inbound messages, and shelve the ones the model
 * is confident about.
 *
 * ## Why this is a cron and not part of ingest
 *
 * The inbound webhook (`/api/v1/webhooks/inbound-email`) answers 429 on any
 * failure, which parks the sender's message in their mail server's retry queue
 * for 24-72 hours. Classifying inside it would put model loading and a second
 * write on the path of every real email, so a classifier bug would delay
 * legitimate mail rather than filter spam. Here, a failure delays only the
 * scoring of messages that are already safely in the database.
 *
 * ## Authorization contract
 *
 * `requireCronSecret` only. The cross-table writes are wrapped by
 * `runInboxSpamScan`, whose write scope is limited to two things: the
 * `spam_score` / `classified_at` columns on `support_inbox_messages`, and
 * `status` on `support_inbox_threads` — and that last one only for threads
 * still `open`, so the job can never overwrite an operator's own triage. The
 * model itself is retrained in memory every run and never persisted, so there
 * is no third table here.
 *
 * There is no audit-log write, deliberately: `support_inbox_*` has no
 * `community_id` for `compliance_audit_log`, and a cron has no human
 * `admin_user_id` for `platform_admin_audit_log`. The `spam_score` and
 * `classified_at` columns on the message row ARE the record.
 *
 * Schedule: hourly, on the hour (vercel.json). At one or two messages a day,
 * a quarter-hourly job was 96 runs to score nothing.
 */
import { runRoute } from '@propertypro/api-contract';

import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { withCronJob } from '@/lib/cron/with-cron-job';
import { runInboxSpamScan } from '@/lib/services/support-inbox/spam-classifier-service';

import { inboxSpamScanContract } from './contract';

const handler = withErrorHandler(
  runRoute(inboxSpamScanContract, async ({ req }) => {
    requireCronSecret(req, process.env.INBOX_SPAM_SCAN_CRON_SECRET, process.env.CRON_SECRET);

    /*
     * No outer try/catch, deliberately — the same reasoning as
     * `visitor-auto-checkout`. Swallowing a failure into a 200 with zero counts
     * is how a job stays broken while every dashboard shows it healthy. Letting
     * the throw reach `withErrorHandler` produces a real 500 and a `job`-tagged
     * Sentry event.
     *
     * The runner supplies the `{ data: ... }` envelope.
     */
    return runInboxSpamScan();
  }),
);

// `withCronJob` must be OUTERMOST — inverted, the throw escapes the isolation
// scope before `withErrorHandler` captures it and the `job` tag is silently
// absent. Enforced by `pnpm guard:cron-job-tagging`.
const cronHandler = withCronJob('inbox-spam-scan', handler);

export const GET = cronHandler;
export const POST = cronHandler;
