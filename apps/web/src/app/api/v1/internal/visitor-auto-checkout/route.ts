/**
 * POST /api/v1/internal/visitor-auto-checkout
 *
 * Hourly cron: auto-checkout visitors whose expected duration has elapsed.
 *
 * Authorization contract: this route uses `createUnscopedClient()` because it
 * must scan and update overdue checked-in visitor records across all
 * communities. Write scope is intentionally limited to `checked_out_at` and
 * `updated_at` on `visitor_log`.
 *
 * Schedule: 0 * * * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { visitorLog } from '@propertypro/db';
import { and, isNotNull, isNull, sql } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET);

  const db = createUnscopedClient();
  const errors: string[] = [];

  try {
    const now = new Date();
    const overdue = await db
      .update(visitorLog)
      .set({ checkedOutAt: now, updatedAt: now })
      .where(
        and(
          isNotNull(visitorLog.checkedInAt),
          isNull(visitorLog.checkedOutAt),
          isNull(visitorLog.deletedAt),
          isNotNull(visitorLog.expectedDurationMinutes),
          sql`${visitorLog.checkedInAt} + (${visitorLog.expectedDurationMinutes} * INTERVAL '1 minute') <= NOW()`,
        ),
      )
      .returning({ id: visitorLog.id });

    return NextResponse.json({
      data: { autoCheckedOut: overdue.length, errors },
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return NextResponse.json({
      data: { autoCheckedOut: 0, errors },
    });
  }
});
