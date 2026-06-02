/**
 * Route contract for `POST /api/v1/internal/payment-reminders`.
 *
 * Plan A1 auto-drain. Internal cron endpoint — invoked hourly by Vercel Cron
 * to process due payment reminders. This is NOT a community-scoped route:
 * there is NO `requireAuthenticatedUserId`, NO `requireCommunityMembership`,
 * and NO RBAC `permission` gate. Authorization is the shared cron-secret
 * Bearer-token check (`requireCronSecret`), preserved verbatim in the handler.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireCronSecret(req, process.env.PAYMENT_REMINDERS_CRON_SECRET)
 *     → processPaymentReminders()
 *
 * Because there is no per-request RBAC resource for cron endpoints, the
 * contract omits `permission` (it is optional in `defineRoute`; the runner
 * never enforces it). Mirrors the cron-auth model — distinct from the
 * community-membership drains.
 *
 * Request: no `params`, `query`, or `body`. The cron POST carries no payload;
 * the handler reads nothing off the request beyond the `Authorization` header
 * (consumed by `requireCronSecret`, outside the contract's schema layer).
 *
 * Response: tight `z.object({...})`. `processPaymentReminders` returns the
 * synthesized `PaymentReminderSummary` shape
 * (`apps/web/src/lib/services/payment-alert-scheduler.ts`):
 *   { communitiesScanned: number; emailsSent: number; errors: number }
 * All three fields are plain integers — there are NO `Date` fields — so a
 * tight schema is safe (no ISO-serialization safeParse mismatch). This differs
 * from the Drizzle-row drains that must use loose `z.unknown()`.
 *
 * Behavior change vs. pre-migration: none on the success path — the runner
 * wraps the handler's return as `{ data: payload }`, byte-identical to the
 * pre-migration `NextResponse.json({ data: summary })`. The 401 path is
 * unchanged (thrown by `requireCronSecret` → `UnauthorizedError` →
 * `withErrorHandler`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const paymentRemindersContract = defineRoute({
  method: 'POST',
  path: '/api/v1/internal/payment-reminders',
  request: {},
  response: z.object({
    communitiesScanned: z.number().int(),
    emailsSent: z.number().int(),
    errors: z.number().int(),
  }),
});
