import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PublicHome } from '@/components/public/public-home';
import { resolvePublicCommunity } from '@/lib/tenant/community-resolution';

interface PublicCommunityPageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * PR #9d — JSX template render branch retired. The page rendered a
 * JSX-compiled HTML payload when the community had a published
 * jsx_template block; that path is gone, the layout-registry render
 * is canonical, and PublicHome is the only fallback at this URL.
 */
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
