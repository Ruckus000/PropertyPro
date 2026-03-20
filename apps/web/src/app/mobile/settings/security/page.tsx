export const dynamic = 'force-dynamic';

/**
 * Mobile Security page — Password change.
 * Server component: auth check, then hands off to client content.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { MobileSecurityContent } from '@/components/mobile/MobileSecurityContent';

export default async function MobileSecurityPage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/auth/login');
  }

  let userId: string;
  let userEmail = '';

  try {
    const user = await requireAuthenticatedUser();
    userId = user.id;
    userEmail = user.email ?? '';
  } catch {
    redirect('/auth/login');
  }

  try {
    await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  return <MobileSecurityContent email={userEmail} communityId={communityId} />;
}
