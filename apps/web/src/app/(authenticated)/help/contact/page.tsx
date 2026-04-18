import Link from 'next/link';
import { createScopedClient, communities } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';

interface HelpContactPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpContactPage({ searchParams }: HelpContactPageProps) {
  const resolvedSearchParams = await searchParams;
  const context = await requireHelpPageContext(resolvedSearchParams, '/help/contact');
  const scoped = createScopedClient(context.communityId);
  const communityRows = await scoped.selectFrom(
    communities,
    {},
    eq(communities.id, context.communityId),
  );
  const community = communityRows[0] as Record<string, unknown> | undefined;
  const hasAnyContact = !!(
    community?.['contactName'] ||
    community?.['contactEmail'] ||
    community?.['contactPhone']
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Management Contact"
        description="Reach your management team using the contact details configured for this community."
        breadcrumb={
          <Link href={`/help?communityId=${context.communityId}`} className="hover:text-content">
            Help Center
          </Link>
        }
      />

      <div className="rounded-2xl border border-edge bg-surface-card p-6 shadow-sm">
        {hasAnyContact ? (
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Contact name
              </p>
              <p className="mt-2 text-sm text-content">
                {(community?.['contactName'] as string | null | undefined) ?? 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Email
              </p>
              <p className="mt-2 text-sm text-content">
                {(community?.['contactEmail'] as string | null | undefined) ?? 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Phone
              </p>
              <p className="mt-2 text-sm text-content">
                {(community?.['contactPhone'] as string | null | undefined) ?? 'Not provided'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-content-secondary">
              Contact information has not been added for this community yet.
            </p>
            {context.membership.isAdmin && (
              <Link
                href={`/settings?communityId=${context.communityId}`}
                className="inline-flex items-center justify-center rounded-xl border border-edge px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
              >
                Update contact info
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
