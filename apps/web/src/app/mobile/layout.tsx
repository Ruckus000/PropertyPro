/**
 * Mobile route group layout — hub-and-spoke navigation.
 *
 * /mobile/* routes share this layout. Protected by middleware.
 * Community ID resolved from x-community-id header (set by middleware).
 */
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { type CommunityType } from '@propertypro/shared';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { MotionProvider } from '@/components/providers/motion-provider';
import { AppQueryProvider } from '@/components/providers/query-provider';
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

  // Preview mode: skip auth, render minimal shell
  const isPreview = requestHeaders.get('x-preview') === 'true';
  if (isPreview) {
    return <>{children}</>;
  }

  let communityName = '';
  let communityType: CommunityType = 'condo_718';

  try {
    const user = await requireAuthenticatedUser();
    const membership = await requireCommunityMembership(communityId, user.id);
    communityType = membership.communityType;
    communityName = membership.communityName;
  } catch {
    redirect('/auth/login');
  }

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
        <AppQueryProvider>
          <MotionProvider>
            <main id="main-content" className="mobile-content">
              {children}
            </main>
          </MotionProvider>
        </AppQueryProvider>
      </div>
    </>
  );
}
