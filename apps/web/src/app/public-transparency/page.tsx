import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
// AUTHZ: Host-native public transparency page; community ID injected by middleware before tenant context exists.
import { findCommunityBySlugUnscoped } from '@propertypro/db/unsafe';
import { getFeaturesForCommunity, resolveCommunityContext, resolveLifecycleState, type CommunityType } from '@propertypro/shared';
import { getCommunityPublicInfo } from '@/lib/api/branding';
import { TransparencyPage } from '@/components/transparency/transparency-page';
import { TransparencyDisabledEmptyState } from '@/components/transparency/transparency-disabled-empty-state';
import { getTransparencyPageData } from '@/lib/services/transparency-service';
import { resolveTimezone } from '@/lib/utils/timezone';

async function resolveCommunityId(): Promise<number | null> {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');
  if (communityIdStr) {
    const communityId = Number(communityIdStr);
    if (Number.isInteger(communityId) && communityId > 0) {
      return communityId;
    }
  }

  const tenantSlug = requestHeaders.get('x-tenant-slug')?.trim().toLowerCase();
  if (tenantSlug) {
    const community = await findCommunityBySlugUnscoped(tenantSlug);
    return community?.id ?? null;
  }

  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantContext = resolveCommunityContext({
    host,
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com',
  });
  if (tenantContext.tenantSlug) {
    const community = await findCommunityBySlugUnscoped(tenantContext.tenantSlug);
    return community?.id ?? null;
  }

  return null;
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

  const features = getFeaturesForCommunity(community.communityType as CommunityType);
  if (!features.hasTransparencyPage) {
    notFound();
  }

  const communityRow = await findCommunityBySlugUnscoped(community.slug);
  if (!communityRow) {
    notFound();
  }

  // Statutory page policy (accepted product decision): a canceled community
  // keeps its public §718.111(12)(g) transparency page through the 7-day paid
  // grace, then it goes offline. notFound() rather than a billing message so the
  // page's absence is indistinguishable from "no such community" and does not
  // leak the association's billing state publicly. `grace` is an entitled state
  // and renders; only `lapsed` (grace expired) is taken offline.
  const lifecycleState = resolveLifecycleState({
    subscriptionStatus: communityRow.subscriptionStatus ?? null,
    subscriptionCanceledAt: communityRow.subscriptionCanceledAt ?? null,
    freeAccessExpiresAt: communityRow.freeAccessExpiresAt ?? null,
  });
  if (lifecycleState === 'lapsed') {
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
