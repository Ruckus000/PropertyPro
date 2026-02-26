import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import { createServerClient } from '@/lib/supabase/server';
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
 * Returns null when no community is selected.
 */
async function resolveCommunity(
  requestHeaders: Headers,
): Promise<{ community: AppShellCommunity; role: CommunityRole } | null> {
  const communityIdStr = requestHeaders.get('x-community-id');
  if (!communityIdStr) return null;

  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;

  try {
    const supabase = await createServerClient();

    // Get user for role lookup
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

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
        .eq('user_id', user.id)
        .eq('community_id', communityId)
        .limit(1)
        .single(),
    ]);

    if (!communityResult.data || !roleResult.data) return null;

    return {
      community: {
        id: communityResult.data.id as number,
        name: communityResult.data.name as string,
        type: communityResult.data.community_type as CommunityType,
      },
      role: roleResult.data.role as CommunityRole,
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
  const [user, communityData] = await Promise.all([
    resolveUser(),
    resolveCommunity(requestHeaders),
  ]);

  const community = communityData?.community ?? null;
  const role = communityData?.role ?? null;
  const features = community ? getFeaturesForCommunity(community.type) : null;

  return (
    <>
      <AuthSessionSync />
      <AppShell user={user} community={community} role={role} features={features}>
        {children}
      </AppShell>
    </>
  );
}
