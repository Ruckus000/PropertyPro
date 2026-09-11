/**
 * ErrorsList — unresolved Sentry issues from the last 24 hours.
 *
 * ## `null` is not an empty list
 *
 * `errors === null` means the console never asked Sentry: `SENTRY_API_TOKEN` or
 * `SENTRY_ORG` is unset, or the API call failed. That renders an INFORMATIONAL
 * banner, never "no errors" — an empty list would assert that production is
 * quiet, which is the single most misleading sentence this surface can produce
 * and is exactly wrong on any console that has never been wired to Sentry.
 *
 * `errors === []` is the genuinely good case and gets a real empty state.
 *
 * The `Bug` icon is tinted by event count rather than by an absolute severity,
 * because Sentry's `level` is set by whatever captured the event and is not
 * comparable across issues; "how often" is the only ranking this view has that
 * means the same thing for every row.
 */
import Link from 'next/link';
import { Bug, CheckCircle2, ExternalLink } from 'lucide-react';
import { AlertBanner, Button, EmptyState } from '@propertypro/ui';
import { MiniBars } from '@/components/dashboard/MiniBars';
import type { SentryIssue } from '@/lib/server/sentry';

interface ErrorsListProps {
  /** `null` = not configured, or the request failed. */
  errors: SentryIssue[] | null;
}

/** Written out in full per band — a template class is invisible to `guard:class-resolution`. */
function countTint(count: number): string {
  if (count >= 50) return 'text-status-danger';
  if (count >= 10) return 'text-status-warning';
  return 'text-content-tertiary';
}

export function ErrorsList({ errors }: ErrorsListProps) {
  return (
    <section aria-labelledby="health-errors" className="space-y-3">
      <h2 id="health-errors" className="text-sm font-semibold text-content-secondary">
        Production errors
        {errors !== null && errors.length > 0 && (
          <span className="ml-2 font-normal text-content-tertiary">
            {errors.length} unresolved · last 24 hours
          </span>
        )}
      </h2>

      {errors === null ? (
        <AlertBanner
          status="info"
          title="Sentry is not configured"
          description="Set SENTRY_API_TOKEN and SENTRY_ORG to list unresolved production errors here. Errors are still being captured — this panel only reads them back."
        />
      ) : errors.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No unresolved errors"
          description="Nothing has been reported to Sentry in the last 24 hours."
        />
      ) : (
        <ul className="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
          {errors.map((issue) => (
            <li key={issue.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <Bug size={16} className={`mt-0.5 shrink-0 ${countTint(issue.count)}`} aria-hidden="true" />

              <div className="min-w-0 flex-1">
                <p className="break-words font-mono text-sm text-content">{issue.title}</p>
                <p className="mt-0.5 break-words text-xs text-content-tertiary">
                  {issue.shortId}
                  {issue.culprit && ` · ${issue.culprit}`}
                </p>
                <p className="mt-1 text-xs text-content-secondary">
                  {issue.count.toLocaleString()} {issue.count === 1 ? 'event' : 'events'}
                </p>
              </div>

              <div className="w-full shrink-0 sm:w-28">
                {/* MiniBars renders nothing for an empty or all-zero series, so an
                    issue with no hourly buckets shows no sparkline rather than an
                    empty box — no guard of our own needed. */}
                <MiniBars
                  data={issue.hourly.map((value, index) => ({
                    month: `h${index}`,
                    value,
                  }))}
                  height={28}
                  seriesLabel="the last 24 hours"
                />
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/tickets/new?ref=${encodeURIComponent(issue.id)}&title=${encodeURIComponent(issue.title)}`}
                  >
                    Create ticket
                  </Link>
                </Button>
                {issue.permalink && (
                  <Button asChild size="sm" variant="ghost">
                    <a
                      href={issue.permalink}
                      target="_blank"
                      rel="noreferrer noopener"
                      // Explicit, because accessible-name computation joins text
                      // nodes with no whitespace — a visible word plus an
                      // `sr-only` suffix announces as one run-together string.
                      aria-label={`Open ${issue.shortId} in Sentry (opens in a new tab)`}
                    >
                      Open in Sentry
                      <ExternalLink size={13} aria-hidden="true" className="ml-1" />
                    </a>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
