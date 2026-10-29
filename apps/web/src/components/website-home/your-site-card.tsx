'use client';

/**
 * The website home's "Your site" (spec C2, corrections 3 and 4): the look,
 * **Edit your site**, **Change look**, when the site was last published and by
 * whom, and Restore.
 *
 * - **Restore previous version** (every plan) puts the site back to how it was
 *   before the last publish. It asks first, because a restore replaces the
 *   draft layer: unpublished edits are discarded.
 * - **See earlier versions** lists the latest publishes, each with **Restore**.
 *   Only on plans with `hasSitePolishBlocks`; the loader sends no list
 *   otherwise.
 *
 * Times read relative to `now`, the moment the page was rendered, so the server
 * and the browser print the same words and nothing changes on hydration.
 */
import { useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CircleAlert, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RestoreError, useRestorePreviousSite } from '@/hooks/use-restore-previous-site';
import { LOOK_SUMMARIES } from '@/lib/site-looks/look-summaries';
import type { LookId } from '@/lib/site-looks/looks';
import { TOUCH } from './touch';
import { LazyConfirmDialog } from './website-home-lazy';

export const RESTORE_PREVIOUS_COPY =
  'Your site goes back to how it was before the last publish. Unpublished edits are discarded.';

export interface YourSiteCardProps {
  communityId: number;
  liveLookId: LookId | null;
  lastPublish: { publishedAt: string; byName: string | null } | null;
  history: Array<{ snapshotId: number; publishedAt: string; byName: string | null; restorable: boolean }> | null;
  /** The version before the last publish, when it can be restored (`WebsiteHomeData.previousSnapshotId`). */
  previousSnapshotId: number | null;
  /** The publish token the page loaded with; Restore refuses if the live site has moved on. */
  publishToken: string | null;
  /** When the page was rendered, ISO 8601. */
  now: string;
  /** Formats a date and time, in the community's time zone. */
  formatDateTime: (iso: string) => string;
}

type Pending = { kind: 'previous' } | { kind: 'version'; snapshotId: number; publishedAt: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago"; older than a month, the date. */
export function relativeTime(iso: string, now: string, formatDateTime: (iso: string) => string): string {
  const elapsed = new Date(now).getTime() - new Date(iso).getTime();
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return ago(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return ago(Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 30 * DAY) return ago(Math.floor(elapsed / DAY), 'day');
  return `on ${formatDateTime(iso)}`;
}

function restoreFailure(error: unknown): string {
  // Every failure the hook reports is a sentence written for this person.
  return error instanceof RestoreError ? error.message : "We couldn't restore your site just now. Please try again.";
}

export function YourSiteCard({
  communityId,
  liveLookId,
  lastPublish,
  history,
  previousSnapshotId,
  publishToken,
  now,
  formatDateTime,
}: YourSiteCardProps) {
  const router = useRouter();
  const { restoreLatest, restoreSnapshot } = useRestorePreviousSite(communityId, {
    publishToken,
    previousSnapshotId,
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [restoringKind, setRestoringKind] = useState<Pending['kind'] | null>(null);
  const restoring = restoringKind !== null;
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const lookName = LOOK_SUMMARIES.find((look) => look.id === liveLookId)?.name ?? 'An older look';

  function ask(next: Pending, event: MouseEvent<HTMLElement>) {
    opener.current = event.currentTarget;
    setError(null);
    setPending(next);
  }

  async function confirm() {
    if (!pending) return;
    const target = pending;
    setRestoringKind(target.kind);
    try {
      await (target.kind === 'previous' ? restoreLatest() : restoreSnapshot(target.snapshotId));
      setPending(null);
      toast.success('Your site is back to the earlier version.');
      router.refresh();
    } catch (cause) {
      setPending(null);
      setError(restoreFailure(cause));
    } finally {
      setRestoringKind(null);
    }
  }

  return (
    <section aria-labelledby="your-site-heading" className="space-y-4 rounded-md border border-edge bg-surface-card p-5">
      <div className="space-y-1">
        <h2 id="your-site-heading" className="text-lg font-semibold text-content">
          Your site
        </h2>
        <p className="text-sm text-content-secondary">
          Look: <span className="font-medium text-content">{lookName}</span>
        </p>
        {lastPublish && (
          <p className="text-sm text-content-secondary">
            Last published{' '}
            <time dateTime={lastPublish.publishedAt} title={formatDateTime(lastPublish.publishedAt)}>
              {relativeTime(lastPublish.publishedAt, now, formatDateTime)}
            </time>
            {lastPublish.byName ? ` by ${lastPublish.byName}` : ''}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className={TOUCH}>
          <Link href={`/pm/website-editor?communityId=${communityId}`}>Edit your site</Link>
        </Button>
        <Button asChild variant="outline" className={TOUCH}>
          <Link href={`/pm/website/looks?communityId=${communityId}`}>Change look</Link>
        </Button>
        <Button asChild variant="outline" className={TOUCH}>
          <Link href={`/pm/website-editor?communityId=${communityId}&view=settings&tab=general`}>
            Site settings
          </Link>
        </Button>
        {previousSnapshotId !== null && (
          <Button
            type="button"
            variant="outline"
            className={TOUCH}
            loading={restoringKind === 'previous'}
            disabled={restoring}
            onClick={(event) => ask({ kind: 'previous' }, event)}
          >
            Restore previous version
          </Button>
        )}
      </div>

      {history && history.length > 1 && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            className={TOUCH}
            aria-expanded={showVersions}
            aria-controls="earlier-versions"
            onClick={() => setShowVersions((open) => !open)}
          >
            <History className="size-4" aria-hidden="true" />
            See earlier versions
          </Button>
          {showVersions && (
            <ul id="earlier-versions" className="divide-y divide-edge-subtle rounded-md border border-edge">
              {history.map((version, index) => (
                <li key={version.snapshotId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="min-w-0 text-sm text-content">
                    <time dateTime={version.publishedAt}>{formatDateTime(version.publishedAt)}</time>
                    {version.byName ? <span className="text-content-secondary"> by {version.byName}</span> : null}
                  </span>
                  {index === 0 ? (
                    <span className="text-sm text-content-secondary">Live now</span>
                  ) : version.restorable ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={TOUCH}
                      disabled={restoring}
                      aria-label={`Restore the version from ${formatDateTime(version.publishedAt)}`}
                      onClick={(event) =>
                        ask({ kind: 'version', snapshotId: version.snapshotId, publishedAt: version.publishedAt }, event)
                      }
                    >
                      Restore
                    </Button>
                  ) : (
                    <span className="text-sm text-content-secondary">Too old to restore</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Present from the start, so a failure that lands in it is announced. */}
      <div role="status">
        {error && (
          <p className="flex items-start gap-2 text-sm text-status-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {pending && (
        <LazyConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !restoring) setPending(null);
          }}
          restoreFocusTo={opener}
          title={pending.kind === 'previous' ? 'Restore the previous version?' : 'Restore this version?'}
          description={
            pending.kind === 'previous'
              ? RESTORE_PREVIOUS_COPY
              : `Your site goes back to how it was on ${formatDateTime(pending.publishedAt)}. Unpublished edits are discarded.`
          }
          confirmLabel="Restore"
          pending={restoring}
          onConfirm={() => void confirm()}
        />
      )}
    </section>
  );
}
