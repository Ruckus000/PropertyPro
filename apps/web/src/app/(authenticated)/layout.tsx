import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity, COMMUNITY_TYPES, isAnyCommunityRole } from '@propertypro/shared';
import type { AnyCommunityRole, CommunityType } from '@propertypro/shared';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { createServerClient } from '@/lib/supabase/server';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';
import { AppShell, type AppShellUser, type AppShellCommunity } from '@/components/layout/app-shell';
import { detectDemoInfo } from '@/lib/demo/detect-demo-info';
import { AppQueryProvider } from '@/components/providers/query-provider';
import { MotionProvider } from '@/components/providers/motion-provider';

/**
 * Resolve authenticated user info from Supabase session.
 * Returns null if not authenticated (middleware handles redirects).
 */
async function resolveUser(): Promise<AppShellUser | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    return {
      id: user.id,
      fullName: (user.user_metadata?.full_name as string) ?? null,
      email: user.email ?? null,
    };
  } catch (error) {
    console.error('[AuthenticatedLayout] Failed to resolve user:', error);
    return null;
  }
}

/**
 * Resolve community context from middleware-injected headers.
 * Uses Drizzle (via listCommunitiesForUser) instead of PostgREST since
 * the authenticated role does not have table-level grants.
 * Returns null when no community is selected.
 */
async function resolveCommunity(
  requestHeaders: Headers,
  userId: string,
): Promise<{ community: AppShellCommunity; role: AnyCommunityRole; subscriptionStatus: string | null; freeAccessExpiresAt: Date | null; isDemo: boolean } | null> {
  const communityIdStr = requestHeaders.get('x-community-id');
  if (!communityIdStr) return null;

  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;

  try {
    const communities = await listCommunitiesForUser(userId);
    const match = communities.find((c) => c.communityId === communityId);
    if (!match) return null;

    const communityType = match.communityType;
    const role = match.role;
    if (
      !COMMUNITY_TYPES.includes(communityType as CommunityType) ||
      !isAnyCommunityRole(role)
    ) {
      return null;
    }

    return {
      community: {
        id: match.communityId,
        name: match.communityName,
        type: communityType as CommunityType,
        plan: match.subscriptionPlan ?? null,
      },
      role: role as AnyCommunityRole,
      subscriptionStatus: match.subscriptionStatus ?? null,
      freeAccessExpiresAt: match.freeAccessExpiresAt ?? null,
      isDemo: match.isDemo,
    };
  } catch (error) {
    console.error('[AuthenticatedLayout] Failed to resolve community:', error);
    return null;
  }
}

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const user = await resolveUser();
  const communityData = user
    ? await resolveCommunity(requestHeaders, user.id)
    : null;

  // If the user is on a community subdomain but has no role in that community,
  // redirect to /select-community so they can pick a community they belong to.
  // Safe from infinite loop: middleware excludes /select-community from tenant
  // resolution (see shouldResolveTenant), so x-community-id won't be set there.
  const hasTenantHeader = !!requestHeaders.get('x-community-id');
  if (!communityData && hasTenantHeader && user) {
    redirect('/select-community');
  }

  const community = communityData?.community ?? null;
  const role = communityData?.role ?? null;
  const subscriptionStatus = communityData?.subscriptionStatus ?? null;
  const freeAccessExpiresAt = communityData?.freeAccessExpiresAt ?? null;
  const features = community ? getFeaturesForCommunity(community.type) : null;
  const demoInfo = detectDemoInfo(communityData?.isDemo ?? false, user?.email ?? null);

  const branding = community ? await getBrandingForCommunity(community.id) : null;
  const theme = community
    ? resolveTheme(branding, community.name, community.type)
    : resolveTheme(null, '', 'condo_718');
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  return (
    <>
      {fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars as React.CSSProperties}>
        <AuthSessionSync />
        <AppQueryProvider>
          <MotionProvider>
            <AppShell user={user} community={community} role={role} features={features} subscriptionStatus={subscriptionStatus} freeAccessExpiresAt={freeAccessExpiresAt} demoInfo={demoInfo}>
              {children}
            </AppShell>
          </MotionProvider>
        </AppQueryProvider>
      </div>
    </>
  );
}
