/**
 * RecentActivityCard — the five most recent operator actions, on the Health board.
 *
 * ## Why this sits on the board at all
 *
 * The board answers "what is broken". This answers the question an operator
 * asks in the same breath and currently cannot: "did one of us just change
 * something?" A cron job that started failing four minutes after somebody
 * retried it, or a Stripe backlog that begins at a plan change, is a different
 * incident from the same symptoms with nobody's hands on the console — and
 * until now the two were indistinguishable from this screen.
 *
 * Five rows, then a link. The board is a glance; `/health/logs` is the read.
 *
 * ## It catches its own failure, because the board cannot throw
 *
 * `health/page.tsx` documents the invariant: this is the screen an operator
 * opens BECAUSE something is already broken, so nothing on it may propagate a
 * failure into a 500. `getAdminActivity()` throws by design (an empty list
 * would assert that nobody has done anything, which a failed query cannot
 * know), so the catch lives here — the same shape `getHealthReport()` uses for
 * every probe.
 *
 * The failed state is a quiet inline line, not an `AlertBanner`: a read failure
 * on a supporting card must not compete with the danger banners that mean
 * production is down. The full-page equivalent on `/health/logs` does use a
 * banner, because there it is the whole content.
 *
 * The `catch` is bare because `getAdminActivity` now captures to Sentry before
 * it rethrows, so this swallow loses the error from the SCREEN and not from
 * telemetry. Capturing here as well would double-report the same failure every
 * time an operator opened the board. Before that capture existed this was a
 * genuine hole: a permanently broken audit read showed one grey sentence and
 * alerted nobody.
 *
 * ## Cost
 *
 * One indexed read of a small append-only table, added to a page that already
 * performs six outbound probes with a 4 s ceiling each plus three privileged
 * reads. `HealthFreshness` re-renders this page every 60 s and on focus, so
 * that is one extra query per minute per open tab — against a table holding
 * single-digit rows in production today.
 */
import Link from 'next/link';
import { ArrowRight, ScrollText } from 'lucide-react';
import { ACTIVITY_CARD_SIZE, getAdminActivity } from '@/lib/server/admin-activity';
import { actionTone, formatLogTime } from './ActivityLogList';

const TONE_TEXT = {
  danger: 'text-status-danger',
  warning: 'text-status-warning',
  info: 'text-status-info',
  neutral: 'text-content-secondary',
} as const;

export async function RecentActivityCard() {
  let entries: Awaited<ReturnType<typeof getAdminActivity>>['entries'] = [];
  let failed = false;

  try {
    ({ entries } = await getAdminActivity({ pageSize: ACTIVITY_CARD_SIZE }));
  } catch {
    // Swallowed on purpose — see the docblock. The board must render.
    failed = true;
  }

  return (
    <section aria-labelledby="health-activity" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="health-activity" className="text-sm font-semibold text-content-secondary">
          Recent operator activity
        </h2>
        <Link
          href="/health/logs"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-content-link hover:text-content-link-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
        >
          View activity log
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
        {failed ? (
          <p className="px-4 py-4 text-sm text-content-tertiary">
            The activity log could not be read just now. The trail is append-only and is
            unaffected — this is a read failure, not a gap in the record.
          </p>
        ) : entries.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-4 text-sm text-content-tertiary">
            <ScrollText size={14} aria-hidden="true" className="shrink-0" />
            No privileged actions recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-edge">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
                <time
                  dateTime={entry.createdAt}
                  className="shrink-0 font-mono text-xs tabular-nums text-content-tertiary"
                >
                  {formatLogTime(entry.createdAt)}
                </time>
                <span
                  className={`font-mono text-xs font-medium ${TONE_TEXT[actionTone(entry.action)]}`}
                >
                  {entry.action}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-content-tertiary">
                  {entry.resourceType}
                  {entry.resourceId && ` #${entry.resourceId}`}
                </span>
                <span className="shrink-0 truncate font-mono text-xs text-content-secondary">
                  {entry.adminEmail ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
