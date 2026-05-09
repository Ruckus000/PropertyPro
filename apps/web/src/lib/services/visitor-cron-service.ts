/**
 * Visitor Cron Service
 *
 * Cross-tenant visitor-cleanup operations (used by hourly auto-checkout cron).
 * Separate from `package-visitor-service` (which is fully tenant-scoped) so
 * the cron's cross-community UPDATE doesn't bleed `@propertypro/db/unsafe`
 * into the per-tenant service surface.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts
 */
import { visitorLog } from '@propertypro/db';
import { and, isNotNull, isNull, sql } from '@propertypro/db/filters';
// AUTHZ: Visitor auto-checkout cron — cross-community cleanup of overdue checked-in visitor passes. Caller MUST validate the cron secret before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface AutoCheckoutResult {
  id: number;
  communityId: number;
}

/**
 * Auto-checkout every visitor whose `expectedDurationMinutes` window has
 * elapsed since `checkedInAt` and who is still checked in (no
 * `checkedOutAt`, not soft-deleted). Sets both `checkedOutAt` and
 * `updatedAt` to the same `now` value.
 *
 * Returns the affected `{id, communityId}` rows so the caller can group them
 * for audit-log emission. Cross-community by design — cron operation only.
 *
 * AUTHZ: cron-only — caller MUST validate the cron secret BEFORE invoking.
 */
export async function autoCheckoutOverdueVisitors(): Promise<AutoCheckoutResult[]> {
  const now = new Date();
  const db = createUnscopedClient();
  return await db
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
    .returning({ id: visitorLog.id, communityId: visitorLog.communityId });
}
