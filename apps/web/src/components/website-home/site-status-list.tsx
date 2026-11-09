'use client';

/**
 * The website overview's status list: the live site at a glance, one fact a
 * row, the way a deployment's overview reads.
 *
 * - **Status**: live, and whether edits are waiting to be published.
 * - **Address**, with **Copy**.
 * - **Look**, with **Change** into the editor's Look row.
 * - **Last published**, and by whom.
 * - **Florida records** (condos and HOAs the statute covers): how many are
 *   posted of those owed, and a way to the missing ones.
 *
 * Status is never colour alone: each state has its own icon and words.
 */
import Link from 'next/link';
import { CircleCheck, CircleDashed, Copy, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { LOOK_SUMMARIES } from '@/lib/site-looks/look-summaries';
import type { LookId } from '@/lib/site-looks/looks';
import { relativeTime } from './your-site-card';
import { TOUCH } from './touch';

export interface SiteStatusListProps {
  communityId: number;
  siteUrl: string;
  liveLookId: LookId | null;
  hasUnpublishedChanges: boolean;
  lastPublish: { publishedAt: string; byName: string | null } | null;
  /** Posted and owed; null where the statute asks for no records list. */
  records: { posted: number; total: number; missing: number } | null;
  /** Switches the overview to its Records tab. */
  onShowRecords: () => void;
  now: string;
  formatDateTime: (iso: string) => string;
}

const ROW = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-edge-subtle py-3 last:border-b-0';

export function SiteStatusList({
  communityId,
  siteUrl,
  liveLookId,
  hasUnpublishedChanges,
  lastPublish,
  records,
  onShowRecords,
  now,
  formatDateTime,
}: SiteStatusListProps) {
  const address = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const lookName = LOOK_SUMMARIES.find((look) => look.id === liveLookId)?.name ?? 'An older look';
  // The app's copy: a toast either way, and a prompt where the clipboard API is
  // missing (an http page, some webviews) rather than a button that does nothing.
  const { copy } = useCopyToClipboard();

  return (
    <dl className="rounded-md border border-edge bg-surface-card px-4" aria-label="Website status">
      <div className={ROW}>
        <dt className="text-sm text-content-secondary">Status</dt>
        <dd className="flex items-center gap-2 text-sm font-medium text-content">
          {hasUnpublishedChanges ? (
            <>
              <CircleDashed className="size-4 shrink-0 text-status-info" aria-hidden="true" />
              Live, with edits waiting to be published
            </>
          ) : (
            <>
              <CircleCheck className="size-4 shrink-0 text-status-success" aria-hidden="true" />
              Live
            </>
          )}
        </dd>
      </div>

      <div className={ROW}>
        <dt className="text-sm text-content-secondary">Address</dt>
        <dd className="flex min-w-0 items-center gap-1">
          <span className="break-all font-mono text-sm text-content">{address}</span>
          <Button type="button" variant="ghost" size="icon" className={TOUCH} aria-label="Copy the address" onClick={() => void copy(siteUrl, 'Link copied.')}>
            <Copy className="size-4" aria-hidden="true" />
          </Button>
        </dd>
      </div>

      <div className={ROW}>
        <dt className="text-sm text-content-secondary">Look</dt>
        <dd className="flex items-center gap-2 text-sm font-medium text-content">
          {lookName}
          <Link
            href={`/pm/website-editor?communityId=${communityId}&item=look`}
            aria-label={`Change the look (now ${lookName})`}
            className={`inline-flex items-center px-1 font-medium text-content-link underline ${TOUCH}`}
          >
            Change
          </Link>
        </dd>
      </div>

      <div className={ROW}>
        <dt className="text-sm text-content-secondary">Last published</dt>
        <dd className="text-sm text-content">
          {lastPublish ? (
            <>
              <time dateTime={lastPublish.publishedAt} title={formatDateTime(lastPublish.publishedAt)}>
                {relativeTime(lastPublish.publishedAt, now, formatDateTime)}
              </time>
              {lastPublish.byName ? ` by ${lastPublish.byName}` : ''}
            </>
          ) : (
            'Not yet'
          )}
        </dd>
      </div>

      {records && records.total > 0 && (
        <div className={ROW}>
          <dt className="text-sm text-content-secondary">Florida records</dt>
          <dd className="flex items-center gap-3 text-sm text-content">
            <span className="font-medium">{`${records.posted} of ${records.total} posted`}</span>
            {records.missing > 0 && (
              <button
                type="button"
                onClick={onShowRecords}
                className={`inline-flex items-center gap-1.5 font-medium text-status-warning underline ${TOUCH}`}
              >
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {`${records.missing} missing`}
              </button>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}
