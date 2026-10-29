/**
 * OwnerRecordsSummary — what the public Documents section says when the
 * association's official records are for owners only.
 *
 * Pure and prop-driven, rendered by the `DocumentsBlock` shell when any group of
 * records has one posted. It names each group with a count and sends owners to
 * sign in. It never names a record: a title, date or file would put the owners'
 * records on the public site, which is exactly what the sign-in is for.
 */

export interface OwnerRecordsSummaryProps {
  /** One entry per group of records. A group with nothing posted is skipped. */
  groups: ReadonlyArray<{ label: string; postedCount: number }>;
  /**
   * The Documents block this summary sits under. It makes the heading id per
   * block, so a page with two Documents sections never repeats one; without it
   * the section is simply left unnamed.
   */
  blockId?: number;
}

export function OwnerRecordsSummary({ groups, blockId }: OwnerRecordsSummaryProps) {
  const headingId = blockId === undefined ? undefined : `owner-records-${blockId}`;
  const posted = groups.filter((group) => group.postedCount > 0);

  return (
    <section className="px-4 py-12 site-sm:px-6 site-lg:px-8" aria-labelledby={headingId}>
      <div className="mx-auto max-w-3xl">
        <h2 id={headingId} className="font-heading text-2xl font-semibold text-content mb-6">
          Association documents
        </h2>
        <p className="text-base text-content-secondary">
          {"Owners can sign in to see the association's official records."}
        </p>
        <ul className="mt-4 space-y-3">
          {posted.map((group) => (
            <li
              key={group.label}
              className="rounded-md border border-edge bg-surface-card p-4 text-base font-medium text-content"
            >
              {`${group.label} · ${group.postedCount}`}
            </li>
          ))}
        </ul>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the public site ships no client runtime, and next/link is a client component; SiteChrome links here the same way */}
        <a
          href="/auth/login"
          className="mt-6 inline-flex items-center rounded-md bg-primary px-6 py-3 text-base font-medium text-content-inverse transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          Owner sign in
        </a>
      </div>
    </section>
  );
}
