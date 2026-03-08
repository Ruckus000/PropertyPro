import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { findCommunityBySlugUnscoped } from '@propertypro/db/unsafe';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { TransparencyPage } from '@/components/transparency/transparency-page';
import { getTransparencyPageData } from '@/lib/services/transparency-service';
import { resolvePublicCommunity } from '@/lib/tenant/community-resolution';

interface Props {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicTransparencyPage({ params, searchParams }: Props) {
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

  const features = getFeaturesForCommunity(community.communityType);
  if (!features.hasTransparencyPage) {
    notFound();
  }

  const communityRow = await findCommunityBySlugUnscoped(community.slug);
  if (!communityRow || !communityRow.transparencyEnabled) {
    notFound();
  }

  const data = await getTransparencyPageData(community);
  return <TransparencyPage data={data} />;
}
