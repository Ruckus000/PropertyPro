/**
 * P3-48/49: Mobile route group layout.
 *
 * /mobile/* routes share this layout. Protected by middleware (already in
 * PROTECTED_PATH_PREFIXES). This layout performs a second server-side auth
 * + membership check to get the community type needed by BottomTabBar.
 *
 * Community ID is resolved from the ?communityId= search param on every
 * request. Unauthenticated or membership-denied requests redirect to login.
 */
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { BottomTabBar } from '@/components/mobile/BottomTabBar';
import '@/styles/mobile.css';

interface MobileLayoutProps {
  children: ReactNode;
  searchParams: Promise<SearchParams>;
}

export default async function MobileLayout({ children, searchParams }: MobileLayoutProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/auth/login');
  }

  const communityId = rawId;
  let userId: string;

  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  let communityType: CommunityType = 'condo_718'; // fallback; overwritten below

  try {
    const membership = await requireCommunityMembership(communityId, userId!);
    communityType = membership.communityType;
  } catch {
    redirect('/auth/login');
  }

  const features = getFeaturesForCommunity(communityType);

  return (
    <div className="mobile-shell">
      <main id="main-content" className="mobile-content">{children}</main>
      <BottomTabBar features={features} communityId={communityId} />
    </div>
  );
}
