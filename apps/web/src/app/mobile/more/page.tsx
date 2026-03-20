export const dynamic = 'force-dynamic';

/**
 * Mobile "More" page — overflow menu for sections not in the bottom tab bar.
 *
 * Shows profile card, grouped navigation links, and sign-out action.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { MobileMoreContent } from '@/components/mobile/MobileMoreContent';

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
    <MobileMoreContent
      userName={userName}
      userRole={displayTitle}
      communityName={communityName}
      communityId={communityId}
    />
  );
}
