import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
// AUTHZ: Host-native public transparency page; community ID injected by middleware before tenant context exists.
import { findCommunityBySlugUnscoped } from '@propertypro/db/unsafe';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { getCommunityPublicInfo } from '@/lib/api/branding';
import { TransparencyPage } from '@/components/transparency/transparency-page';
import { TransparencyDisabledEmptyState } from '@/components/transparency/transparency-disabled-empty-state';
import { getTransparencyPageData } from '@/lib/services/transparency-service';
import { resolveTimezone } from '@/lib/utils/timezone';

async function resolveCommunityId(): Promise<number | null> {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');
  if (!communityIdStr) return null;

  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;

  return communityId;
}

export default async function PublicTransparencyHostPage() {
  const communityId = await resolveCommunityId();
  if (!communityId) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6">
        <p className="text-content-secondary">Community not found.</p>
      </div>
    );
  }

  const community = await getCommunityPublicInfo(communityId);
  if (!community) {
    notFound();
  }

  const features = getFeaturesForCommunity(community.communityType);
  if (!features.hasTransparencyPage) {
    notFound();
  }

  const communityRow = await findCommunityBySlugUnscoped(community.slug);
  if (!communityRow) {
    notFound();
  }

  if (!communityRow.transparencyEnabled) {
    return <TransparencyDisabledEmptyState communityName={community.name} />;
  }

  const data = await getTransparencyPageData({
    id: community.id,
    slug: community.slug,
    name: community.name,
    communityType: community.communityType as CommunityType,
    timezone: resolveTimezone(communityRow.timezone),
    addressLine1: communityRow.addressLine1,
    addressLine2: communityRow.addressLine2,
    city: communityRow.city,
    state: communityRow.state,
    zipCode: communityRow.zipCode,
  });

  return <TransparencyPage data={data} />;
}
