import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
// AUTHZ: Host-native public transparency page; community ID injected by middleware before tenant context exists.
import { findCommunityBySlugUnscoped } from '@propertypro/db/unsafe';
import { getFeaturesForCommunity, resolveCommunityContext, resolveLifecycleState, type CommunityType } from '@propertypro/shared';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { isSearchIndexingEnabled } from '@/lib/site-editor/site-settings';
import type { Metadata } from 'next';
import { TransparencyPage } from '@/components/transparency/transparency-page';
import { TransparencyDisabledEmptyState } from '@/components/transparency/transparency-disabled-empty-state';
import { getTransparencyPageData } from '@/lib/services/transparency-service';
import { UrgentNoticeBanner } from '@/components/public-site/UrgentNoticeBanner';
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

/**
 * Website editor v3, Phase 8 — honour the PM's search-indexing choice here too.
 *
 * This page had no `generateMetadata` at all, so it inherited the root layout's
 * and was indexable regardless. Applying the flag to only one of a community's
 * two public pages would be a half-implementation: a PM who opts out would
 * still find this page in search results.
 *
 * Honouring the opt-out is consistent with the statute. §718.111(12)(g)
 * requires the records be posted on a website accessible to owners; it does not
 * require search-engine indexing. Nothing about the page's availability changes
 * — only whether crawlers are asked to list it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const communityId = await resolveCommunityId();
  if (!communityId) return {};
  const community = await getCommunityPublicInfo(communityId);
  if (!community) return {};

  const branding = await getBrandingForCommunity(community.id);
  const indexable = isSearchIndexingEnabled(branding);

  return {
    title: `Records & Transparency — ${community.name}`,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
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

  // This page has no shared layout with /public-site, so the banner is rendered
  // here explicitly. It belongs on both: a resident checking the statutory
  // transparency page during a storm is exactly the reader an urgent notice is
  // for, and "every page of the public site" has to include this one.
  if (!communityRow.transparencyEnabled) {
    return (
      <>
        <UrgentNoticeBanner notice={community} />
        <TransparencyDisabledEmptyState communityName={community.name} />
      </>
    );
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

  return (
    <>
      <UrgentNoticeBanner notice={community} />
      <TransparencyPage data={data} />
    </>
  );
}
