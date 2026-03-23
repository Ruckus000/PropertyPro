import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolvePublicCommunity } from '@/lib/tenant/community-resolution';
import { RequestAccessForm } from '@/components/access-requests/request-access-form';

interface Props {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RequestAccessPage({ params, searchParams }: Props) {
  const [{ subdomain }, resolvedSearchParams, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const community = await resolvePublicCommunity(
    resolvedSearchParams,
    subdomain,
    requestHeaders.get('host'),
  );

  if (!community) {
    notFound();
  }

  const refCode =
    typeof resolvedSearchParams['ref'] === 'string'
      ? resolvedSearchParams['ref']
      : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--surface-base)' }}>
      <RequestAccessForm
        communityId={community.id}
        communitySlug={community.slug}
        communityName={community.name}
        refCode={refCode}
      />
    </div>
  );
}
