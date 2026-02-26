/**
 * P3-47: PM white-label branding settings page.
 *
 * Route: /pm/settings/branding?communityId=X
 * Auth: property_manager_admin required (redirects to community list on failure).
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { BrandingForm } from '@/components/pm/BrandingForm';

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
  if (membership.role !== 'property_manager_admin') {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  const branding = await getBrandingForCommunity(communityId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Branding Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Customize the logo and brand colors for this community&apos;s portal.
        </p>
      </div>

      <BrandingForm communityId={communityId} initialBranding={branding ?? {}} />
    </div>
  );
}
