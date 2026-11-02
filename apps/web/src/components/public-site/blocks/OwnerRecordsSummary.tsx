/**
 * OwnerRecordsSummary — what the public Documents section says when the
 * association's official records are for owners only.
 *
 * Pure and prop-driven, rendered by the `DocumentsBlock` shell when any group of
 * records has one posted. It names each group with a count and sends owners to
 * sign in. It never names a record: a title, date or file would put the owners'
 * records on the public site, which is exactly what the sign-in is for.
 */
import { SiteSection } from './SiteSection';

export interface OwnerRecordsSummaryProps {
  /** One entry per group of records. A group with nothing posted is skipped. */
  groups: ReadonlyArray<{ label: string; postedCount: number }>;
  /**
   * The Documents block this summary sits under. It makes the heading id per
   * block, so a page with two Documents sections never repeats one; without it
   * the section is simply left unnamed.
   */
  blockId?: number;
  /**
   * The Documents section's anchor id, when this summary is all that section
   * shows (see `BlockRendererProps.anchorId`).
   */
  anchorId?: string;
}

export function OwnerRecordsSummary({ groups, blockId, anchorId }: OwnerRecordsSummaryProps) {
  const headingId = blockId === undefined ? undefined : `owner-records-${blockId}`;
  const posted = groups.filter((group) => group.postedCount > 0);

  return (
    <SiteSection id={anchorId} headingId={headingId} title="Association documents">
      <p className="max-w-prose text-base text-content-secondary">
        {"Owners can sign in to see the association's official records."}
      </p>
      <ul className="mt-6 divide-y divide-edge border-y border-edge">
        {posted.map((group) => (
          <li key={group.label} className="flex items-baseline justify-between gap-6 py-4 text-base">
            <span className="font-semibold text-content">{group.label}</span>
            {/* Heard as "Financial records · 3", as it read before the count moved right. */}
            <span className="sr-only"> · </span>
            <span className="text-content-secondary">{group.postedCount}</span>
          </li>
        ))}
      </ul>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the public site ships no client runtime, and next/link is a client component; SiteChrome links here the same way */}
      <a
        href="/auth/login"
        className="mt-8 inline-flex min-h-11 items-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-content-inverse transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2"
      >
        Owner sign in
      </a>
    </SiteSection>
  );
}
