'use client';

/**
 * FailedJobsList — failed cron runs and unprocessed Stripe webhook events, with
 * a one-click retry for the ones that have an endpoint behind them.
 *
 * ## Why a retry is not offered for every row
 *
 * `retryable` comes from the report, not from this component. A cron row carries
 * a `slug` that `POST /api/admin/health/jobs/[slug]/retry` will accept; a Stripe
 * row does not — there is no internal endpoint that replays a Stripe event, and
 * replay is a Stripe-dashboard action. A button that cannot work is worse than
 * no button, so the decision lives with the data.
 *
 * ## Result reporting
 *
 * There is no toast system in this app, so each row reports inline through a
 * `role="status"` region. That is deliberately MORE than a toast would give: a
 * retry result an operator needs to read is not something that should disappear
 * on a timer, and `aria-live` announces it without stealing focus.
 *
 * A retry is reported honestly, and "honestly" now distinguishes FOUR outcomes
 * rather than three. The one that was missing is the difference between *the
 * retry was not delivered* and *the job refused it*:
 *
 *  - **succeeded.**
 *  - **not delivered — 404.** The endpoint does not exist at that path. Nothing
 *    ran, so there is nothing in Sentry, and telling an operator to look there
 *    sends them to an empty page during an incident.
 *  - **not delivered — 401/403.** The web app rejected the credential. That is a
 *    `CRON_SECRET` mismatch between the two deployments, which is exactly the
 *    failure that once had every cron 401ing silently for months behind a green
 *    dashboard — the thing this board exists to make visible.
 *  - **the job ran and failed.** Any other status. Sentry is the right place.
 *
 * The old copy called all three of those "The job ran and failed (HTTP n).
 * Check Sentry for the cause", which was a wrong sentence for two of them.
 *
 * `router.refresh()` re-reads the server report on success so the row's attempt
 * count and age stop being stale.
 *
 * ## Why the live region is always mounted
 *
 * `<p role="status">` is rendered unconditionally and its TEXT appears later. A
 * live region inserted into the DOM at the same moment as its content is
 * announced unreliably by NVDA and JAWS — the region has to exist before it
 * changes for the change to be observed. An empty region renders nothing
 * visible, so this costs no layout.
 */
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { Badge, Button, EmptyState } from '@propertypro/ui';
import type { FailedJob } from '@/lib/server/health';

interface FailedJobsListProps {
  jobs: FailedJob[];
}

type RetryOutcome = { state: 'ok' | 'failed'; message: string };

/**
 * What a non-ok status from the web app actually means.
 *
 * A 404 or a 401 means the retry never reached the job — a different sentence
 * from "the job refused it", and pointing at Sentry for either sends an operator
 * to an empty page while something is on fire.
 */
function undeliveredOrFailed(status: number | undefined): string {
  if (status === 404) {
    return 'The retry was not delivered: the web app has no endpoint at that path (HTTP 404). The job did not run, so there is nothing in Sentry.';
  }
  if (status === 401 || status === 403) {
    return `The web app rejected the retry (HTTP ${status}). That is a CRON_SECRET mismatch between this console and the web deployment — the job did not run.`;
  }
  return `The job ran and failed (HTTP ${status ?? 'unknown'}). Check Sentry for the cause.`;
}

export function FailedJobsList({ jobs }: FailedJobsListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, RetryOutcome>>({});

  const retryable = jobs.filter((job) => job.retryable && job.slug);

  const retry = useCallback(
    async (slug: string): Promise<void> => {
      setRunning((current) => new Set(current).add(slug));
      try {
        const response = await fetch(
          `/api/admin/health/jobs/${encodeURIComponent(slug)}/retry`,
          { method: 'POST' },
        );
        const body: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            (body as { error?: { message?: string } } | null)?.error?.message ??
            `The retry could not be sent (HTTP ${response.status}).`;
          setOutcomes((current) => ({ ...current, [slug]: { state: 'failed', message } }));
          return;
        }

        const result = (body as { data?: { status?: number; ok?: boolean } } | null)?.data;
        if (result?.ok) {
          setOutcomes((current) => ({
            ...current,
            [slug]: { state: 'ok', message: 'Retry ran successfully.' },
          }));
          // Re-read the server report so attempts and age are not stale.
          startTransition(() => router.refresh());
        } else {
          setOutcomes((current) => ({
            ...current,
            [slug]: { state: 'failed', message: undeliveredOrFailed(result?.status) },
          }));
        }
      } catch {
        setOutcomes((current) => ({
          ...current,
          [slug]: { state: 'failed', message: 'We could not reach the server. Please try again.' },
        }));
      } finally {
        setRunning((current) => {
          const next = new Set(current);
          next.delete(slug);
          return next;
        });
      }
    },
    [router],
  );

  const retryAll = useCallback(async () => {
    // Sequential, not `Promise.all`. Each retry makes the web app run privileged
    // scheduled work; firing five at once is a self-inflicted load spike on the
    // deployment an operator is already worried about.
    for (const job of retryable) {
      if (job.slug) await retry(job.slug);
    }
  }, [retryable, retry]);

  const busy = running.size > 0;

  return (
    <section aria-labelledby="health-jobs" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="health-jobs" className="text-sm font-semibold text-content-secondary">
          Failed jobs
          {jobs.length > 0 && (
            <span className="ml-2 font-normal text-content-tertiary">{jobs.length}</span>
          )}
        </h2>
        {retryable.length > 1 && (
          <Button size="sm" variant="outline" onClick={retryAll} disabled={busy}>
            {busy ? (
              <Loader2 size={14} aria-hidden="true" className="mr-1 animate-spin" />
            ) : (
              <RotateCcw size={14} aria-hidden="true" className="mr-1" />
            )}
            Retry all ({retryable.length})
          </Button>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Every scheduled job is healthy"
          description="Cron runs and Stripe webhook events are all processing. Failures show up here with a retry."
        />
      ) : (
        <ul className="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
          {jobs.map((job) => {
            const key = `${job.source}:${job.name}`;
            const isRunning = job.slug ? running.has(job.slug) : false;
            const outcome = job.slug ? outcomes[job.slug] : undefined;

            return (
              <li key={key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <Badge variant={job.source === 'Cron' ? 'warning' : 'info'} className="shrink-0">
                  {job.source}
                </Badge>

                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-content">{job.name}</p>
                  <p className="mt-0.5 break-words font-mono text-xs text-status-danger">
                    {job.error}
                  </p>
                  <p className="mt-1 text-xs text-content-tertiary">
                    {job.when} · {job.attempts}
                  </p>
                  {/*
                    Always mounted, even with nothing to say. A live region
                    inserted alongside its own text is announced unreliably by
                    NVDA and JAWS; the region has to exist BEFORE it changes.
                  */}
                  <p
                    role="status"
                    className={
                      outcome
                        ? `mt-2 flex items-start gap-1.5 text-xs ${
                            outcome.state === 'ok' ? 'text-status-success' : 'text-status-danger'
                          }`
                        : 'sr-only'
                    }
                  >
                    {outcome &&
                      (outcome.state === 'ok' ? (
                        <CheckCircle2 size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
                      ))}
                    {outcome?.message}
                  </p>
                </div>

                {job.retryable && job.slug && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isRunning}
                    onClick={() => void retry(job.slug!)}
                    // An explicit label, not a visible word plus an `sr-only`
                    // span: accessible-name computation concatenates text nodes
                    // WITHOUT inserting whitespace, so `Retry` + ` expire-demos`
                    // is announced as "Retryexpire-demos".
                    aria-label={`${isRunning ? 'Retrying' : 'Retry'} ${job.name}`}
                  >
                    {isRunning ? (
                      <Loader2 size={14} aria-hidden="true" className="mr-1 animate-spin" />
                    ) : (
                      <RotateCcw size={14} aria-hidden="true" className="mr-1" />
                    )}
                    {isRunning ? 'Retrying' : 'Retry'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
