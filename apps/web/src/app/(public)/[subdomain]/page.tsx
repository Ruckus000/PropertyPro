import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PublicHome } from '@/components/public/public-home';
import { resolvePublicCommunity } from '@/lib/tenant/community-resolution';

interface PublicCommunityPageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicCommunityPage({
  params,
  searchParams,
}: PublicCommunityPageProps) {
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

  return <PublicHome community={community} />;
}
