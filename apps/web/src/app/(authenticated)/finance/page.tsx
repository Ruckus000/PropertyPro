import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Compatibility redirect: /finance?communityId=X -> /communities/X/payments?tab=overview
 */
export default async function FinanceRedirectPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (context.communityId) {
    redirect(`/communities/${context.communityId}/payments?tab=overview`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Payments" />
      <p className="mt-2 text-sm text-content-secondary">
        Add a valid <code className="rounded bg-surface-muted px-1">communityId</code> query parameter to view payments.
      </p>
    </div>
  );
}
