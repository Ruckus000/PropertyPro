/**
 * P3-47: PM white-label branding settings page.
 *
 * Route: /pm/settings/branding?communityId=X
 * Auth: property_manager_admin required (redirects to community list on failure).
 *
 * Shows a multi-community BrandingTable overview above the single-community
 * BrandingForm for the selected community.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { findManagedCommunitiesPortfolioUnscoped } from '@propertypro/db/unsafe';
import { BrandingForm } from '@/components/pm/BrandingForm';
import { BrandingTable } from '@/components/pm/BrandingTable';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function BrandingSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  const communityId = rawId;
  let userId: string;

  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId!);
  if (membership.role !== 'pm_admin') {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  // Fetch branding for the current community + all managed communities
  const [branding, managedCommunities] = await Promise.all([
    getBrandingForCommunity(communityId),
    findManagedCommunitiesPortfolioUnscoped(userId!),
  ]);

  // Load branding for each managed community
  const communitiesWithBranding = await Promise.all(
    managedCommunities.map(async (c) => ({
      communityId: c.communityId,
      communityName: c.communityName,
      branding: await getBrandingForCommunity(c.communityId),
    })),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Branding Settings</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Manage branding across all your communities or customize a specific community below.
        </p>
      </div>

      {/* Multi-community branding overview */}
      {communitiesWithBranding.length > 1 && (
        <div className="mb-10">
          <h2 className="mb-3 text-lg font-medium text-content">All Communities</h2>
          <BrandingTable
            currentCommunityId={communityId}
            communities={communitiesWithBranding}
          />
        </div>
      )}

      {/* Single-community branding form */}
      <div>
        <h2 className="mb-3 text-lg font-medium text-content">
          Edit Branding
        </h2>
        <BrandingForm communityId={communityId} initialBranding={branding ?? {}} />
      </div>
    </div>
  );
}
