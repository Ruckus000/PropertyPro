export const dynamic = 'force-dynamic';

/**
 * Mobile Profile page (URL stays at /mobile/more for bookmark compatibility).
 * Shows profile card, grouped settings, and sign-out.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requirePageAuthenticatedUser as requireAuthenticatedUser } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { MobileProfileContent } from '@/components/mobile/MobileProfileContent';

export default async function MobileMorePage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/auth/login');
  }

  let userId: string;
  let userName: string | null = null;

  try {
    const user = await requireAuthenticatedUser();
    userId = user.id;
    userName = (user.user_metadata?.full_name as string) ?? null;
  } catch {
    redirect('/auth/login');
  }

  let communityName = '';
  let displayTitle = '';

  try {
    const membership = await requireCommunityMembership(communityId, userId!);
    communityName = membership.communityName;
    displayTitle = membership.displayTitle;
  } catch {
    redirect('/auth/login');
  }

  return (
    <MobileProfileContent
      userName={userName}
      userRole={displayTitle}
      communityName={communityName}
      communityId={communityId}
    />
  );
}
