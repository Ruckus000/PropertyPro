import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Compatibility redirect: /payments?communityId=X -> /communities/X/payments
 */
export default async function PaymentsRedirectPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (context.communityId) {
    redirect(`/communities/${context.communityId}/payments`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
      <p className="mt-2 text-sm text-gray-600">
        Add a valid <code className="rounded bg-gray-100 px-1">communityId</code> query parameter to view your payments.
      </p>
    </div>
  );
}
