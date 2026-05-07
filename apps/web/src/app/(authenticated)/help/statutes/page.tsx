/**
 * Statute reverse-index page (WS5).
 *
 * Lists every distinct Florida statute / bill reference that appears in any
 * help article frontmatter, sorted by frequency. Each entry links to the
 * detail page at /help/statutes/[ref].
 *
 * The data source is the MDX frontmatter `statutes` array — same field the
 * article detail page renders as a colored pill. The frontmatter schema
 * enforces format at PR time (`§NNN.NNN…` or `HB|SB NNNN`).
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { listAllStatutes } from '@/lib/services/help-article-service';

interface StatutesIndexPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StatutesIndexPage({
  searchParams,
}: StatutesIndexPageProps) {
  const resolvedSearchParams = await searchParams;
  const context = await requireHelpPageContext(
    resolvedSearchParams,
    '/help/statutes',
  );
  const statutes = listAllStatutes();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statutes & bills"
        breadcrumb={
          <Breadcrumbs
            items={[
              {
                label: 'Help Center',
                href: `/help?communityId=${context.communityId}`,
              },
            ]}
            currentLabel="Statutes & bills"
          />
        }
        description="Every Florida statute and bill referenced in our guides. Click one to see all articles tagged with it."
      />

      {statutes.length === 0 ? (
        <p className="text-sm text-content-secondary">
          No statute references found in the help corpus.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {statutes.map(({ ref, count }) => (
            <li key={ref}>
              <Link
                href={`/help/statutes/${encodeURIComponent(ref)}?communityId=${context.communityId}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-edge bg-surface-card p-4 transition-colors hover:border-edge-strong hover:bg-surface-hover"
              >
                <div>
                  <p className="font-mono text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                    {ref}
                  </p>
                  <p className="mt-1 text-xs text-content-tertiary">
                    {count} {count === 1 ? 'article' : 'articles'}
                  </p>
                </div>
                <ArrowRight
                  size={14}
                  className="text-content-disabled transition-colors group-hover:text-[var(--interactive-primary)]"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
