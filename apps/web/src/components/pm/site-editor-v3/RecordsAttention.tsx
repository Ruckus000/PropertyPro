'use client';

/**
 * The top bar's missing-records link (combined plan Task 28): how many Florida
 * records the website still lacks, linking to the list on the website home.
 *
 * The same count, from the same query, as the sidebar's Website badge
 * (`useRecordsAlert`, D11). Like the badge it ignores this manager's snooze: a
 * snoozed alert hides the website home's banner, not the number.
 *
 * Condos and HOAs only. The editor page already requires a manager on a plan
 * with the site editor, which is the rest of the badge's condition, so the
 * caller decides `enabled` from the community type alone.
 *
 * Code-split by `EditorRoot` (`ssr: false`), so the hook stays out of the
 * editor's first load. It renders nothing until there is a count to show.
 */

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { useRecordsAlert } from '@/hooks/use-records-alert';

export interface RecordsAttentionProps {
  communityId: number;
  /** False sends no request and shows nothing (apartments owe no records). */
  enabled: boolean;
}

export function RecordsAttention({ communityId, enabled }: RecordsAttentionProps) {
  const { data } = useRecordsAlert(communityId, { enabled });
  const count = enabled ? (data?.missingCount ?? 0) : 0;
  if (count <= 0) return null;

  const label = `${count} missing ${count === 1 ? 'record' : 'records'}`;
  return (
    <Link
      href={`/pm/website?communityId=${communityId}#records`}
      title={label}
      data-testid="editor-missing-records"
      // Icon, number and words, never the colour alone. Below 1280px the bar
      // has room for the icon and the number only; the words stay in the
      // accessible name at every width.
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-status-warning-border bg-status-warning-bg px-2.5 text-xs font-semibold text-status-warning hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      <span aria-hidden="true" className="xl:hidden">
        {count}
      </span>
      <span className="sr-only xl:not-sr-only">{label}</span>
    </Link>
  );
}
