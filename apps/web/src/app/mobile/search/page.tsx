export const dynamic = 'force-dynamic';

/**
 * Mobile search page — full-screen search interface.
 *
 * Same feature registry filtering as the desktop command palette,
 * rendered in a single-column mobile layout.
 */
import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { MobileSearchContent } from '@/components/mobile/MobileSearchContent';

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function MobileSearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId);
  } catch {
    redirect('/auth/login');
  }

  const features = getFeaturesForCommunity(membership.communityType);

  return (
    <MobileSearchContent
      communityId={communityId}
      role={membership.role}
      features={features}
    />
  );
}
