/**
 * Internal cron — process due payment reminders.
 *
 * POST /api/v1/internal/payment-reminders
 *
 * Plan A1 auto-drain. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim
 * — this is a cron endpoint gated by the shared cron secret, NOT community
 * membership:
 *   requireCronSecret(req, process.env.PAYMENT_REMINDERS_CRON_SECRET)
 *     → processPaymentReminders()
 *
 * No `params`, `query`, or `body` — the cron POST carries no payload. The
 * success wire shape `{ data: summary }` is byte-identical to the
 * pre-migration handler; the runner wraps the returned `PaymentReminderSummary`
 * as `{ data: payload }`. The 401 path (`requireCronSecret` →
 * `UnauthorizedError`) is unchanged.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processPaymentReminders } from '@/lib/services/payment-alert-scheduler';
import { paymentRemindersContract } from './contract';

export const POST = withErrorHandler(
  runRoute(paymentRemindersContract, async ({ req }) => {
    requireCronSecret(req, process.env.PAYMENT_REMINDERS_CRON_SECRET);

    return processPaymentReminders();
  }),
);
