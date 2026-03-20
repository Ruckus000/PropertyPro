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
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { BottomTabBar } from '@/components/mobile/BottomTabBar';
import { MobileTopBar } from '@/components/mobile/MobileTopBar';
import { MotionProvider } from '@/components/providers/motion-provider';
import '@/styles/mobile.css';

interface MobileLayoutProps {
  children: ReactNode;
}

export default async function MobileLayout({ children }: MobileLayoutProps) {
  const requestHeaders = await headers();
  const rawId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/auth/login');
  }

  const communityId = rawId;

  // Preview mode: skip auth, render minimal shell (no nav bars).
  // The page handles its own branding/fonts when rendering templates.
  const isPreview = requestHeaders.get('x-preview') === 'true';
  if (isPreview) {
    return <>{children}</>;
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

  let communityType: CommunityType = 'condo_718'; // fallback; overwritten below
  let communityName = '';

  try {
    const membership = await requireCommunityMembership(communityId, userId!);
    communityType = membership.communityType;
    communityName = membership.communityName;
  } catch {
    redirect('/auth/login');
  }

  const features = getFeaturesForCommunity(communityType);

  const branding = await getBrandingForCommunity(communityId);
  const theme = resolveTheme(branding, communityName, communityType);
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  return (
    <>
      {fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div className="mobile-shell" style={cssVars as React.CSSProperties}>
        <MobileTopBar communityName={communityName} userName={userName} communityId={communityId} />
        <MotionProvider>
          <main id="main-content" className="mobile-content">{children}</main>
        </MotionProvider>
        <BottomTabBar features={features} communityId={communityId} />
      </div>
    </>
  );
}
