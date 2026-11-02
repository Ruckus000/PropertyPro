/**
 * OwnerRecordsSummary — what the public Documents section says when the
 * association's official records are for owners only.
 *
 * Pure and prop-driven, rendered by the `DocumentsBlock` shell when any group of
 * records has one posted. It names each group with a count and sends owners to
 * sign in. It never names a record: a title, date or file would put the owners'
 * records on the public site, which is exactly what the sign-in is for.
 */
import { FileText, Lock } from 'lucide-react';
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
    <SiteSection
      id={anchorId}
      headingId={headingId}
      title="Association documents"
      intro="Owners can sign in to see the association's official records."
    >
      <div className="rounded-md border border-edge bg-surface-card p-6 site-sm:p-8">
        <ul className="divide-y divide-edge">
          {posted.map((group) => (
            <li key={group.label} className="flex items-center justify-between gap-6 py-4 first:pt-0">
              <span className="inline-flex items-center gap-3 text-lg text-content">
                <FileText className="h-5 w-5 shrink-0 text-content-secondary" aria-hidden="true" />
                {group.label}
              </span>
              {/* Heard as "Financial records · 3", as it read before the count moved right. */}
              <span className="sr-only"> · </span>
              <span className="font-heading text-3xl leading-none text-content">{group.postedCount}</span>
            </li>
          ))}
        </ul>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the public site ships no client runtime, and next/link is a client component; SiteChrome links here the same way */}
        <a
          href="/auth/login"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-semibold text-content-inverse transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2"
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          Owner sign in
        </a>
      </div>
    </SiteSection>
  );
}
