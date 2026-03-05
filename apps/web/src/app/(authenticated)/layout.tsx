import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { getFeaturesForCommunity, COMMUNITY_TYPES, COMMUNITY_ROLES } from '@propertypro/shared';
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { createServerClient } from '@/lib/supabase/server';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';
import { AppShell, type AppShellUser, type AppShellCommunity } from '@/components/layout/app-shell';

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

    // Fetch profile from users table for fullName
    const { data: profile } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .limit(1)
      .single();

    return {
      id: user.id,
      fullName: profile?.full_name ?? null,
      email: user.email ?? null,
    };
  } catch (error) {
    console.error('[AuthenticatedLayout] Failed to resolve user:', error);
    return null;
  }
}

/**
 * Resolve community context from middleware-injected headers.
 * Accepts the already-resolved userId to avoid a duplicate auth call.
 * Returns null when no community is selected.
 */
async function resolveCommunity(
  requestHeaders: Headers,
  userId: string,
): Promise<{ community: AppShellCommunity; role: CommunityRole } | null> {
  const communityIdStr = requestHeaders.get('x-community-id');
  if (!communityIdStr) return null;

  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;

  try {
    const supabase = await createServerClient();

    // Fetch community info and user role in parallel
    const [communityResult, roleResult] = await Promise.all([
      supabase
        .from('communities')
        .select('id, name, community_type')
        .eq('id', communityId)
        .is('deleted_at', null)
        .limit(1)
        .single(),
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('community_id', communityId)
        .limit(1)
        .single(),
    ]);

    if (!communityResult.data || !roleResult.data) return null;

    const communityType = communityResult.data.community_type;
    const role = roleResult.data.role;
    if (
      !COMMUNITY_TYPES.includes(communityType as CommunityType) ||
      !COMMUNITY_ROLES.includes(role as CommunityRole)
    ) {
      return null;
    }

    return {
      community: {
        id: communityResult.data.id,
        name: communityResult.data.name,
        type: communityType as CommunityType,
      },
      role: role as CommunityRole,
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

  const community = communityData?.community ?? null;
  const role = communityData?.role ?? null;
  const features = community ? getFeaturesForCommunity(community.type) : null;

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
        <AppShell user={user} community={community} role={role} features={features}>
          {children}
        </AppShell>
      </div>
    </>
  );
}
