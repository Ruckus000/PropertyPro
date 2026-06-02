/**
 * Daily cron: Transition pending assessment line items to overdue status.
 *
 * Runs at 06:00 UTC daily. Finds all line items with status='pending'
 * and due_date < today, then updates them to status='overdue'.
 *
 * Schedule: 0 6 * * * (vercel.json)
 *
 * Plan A1 auto-drain. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Cron-secret auth chain
 * preserved verbatim:
 *   requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET)
 *     → processOverdueTransitions()
 *
 * Wire shape `{ data: summary }` byte-identical to pre-migration.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processOverdueTransitions } from '@/lib/services/assessment-automation-service';
import { assessmentOverdueContract } from './contract';

export const POST = withErrorHandler(
  runRoute(assessmentOverdueContract, async ({ req }) => {
    requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET);

    return processOverdueTransitions();
  }),
);
