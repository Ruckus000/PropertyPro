import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';
import { IdleSessionManager } from '@/components/auth/idle-session-manager';
import { AppShell } from '@/components/layout/app-shell';
import { detectDemoInfo } from '@/lib/demo/detect-demo-info';
import { AppQueryProvider } from '@/components/providers/query-provider';
import { SupportBanner } from '@/components/support/SupportBanner';
import { getPageShellBranding, getPageShellContext } from '@/lib/request/page-shell-context';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const shellContext = await getPageShellContext();
  const user = shellContext.user;
  const community = shellContext.community;
  const role = shellContext.role;
  const isUnitOwner = shellContext.isUnitOwner;
  const designation = shellContext.designation;
  const subscriptionStatus = shellContext.subscriptionStatus;
  const subscriptionCanceledAt = shellContext.subscriptionCanceledAt;
  const subscriptionCurrentPeriodEndAt = shellContext.subscriptionCurrentPeriodEndAt;
  const freeAccessExpiresAt = shellContext.freeAccessExpiresAt;
  const resourceAccess = shellContext.resourceAccess;

  // If the user is on a community subdomain but has no role in that community,
  // redirect to /select-community so they can pick a community they belong to.
  // Safe from infinite loop: middleware excludes /select-community from tenant
  // resolution (see shouldResolveTenant), so x-community-id won't be set there.
  const hasTenantHeader = !!requestHeaders.get('x-community-id');
  if (!community && hasTenantHeader && user) {
    redirect('/select-community');
  }

  const features = shellContext.features;
  // Independent lookups — run them concurrently; this layout re-renders on
  // every authenticated navigation, so serial awaits here tax every click.
  const [demoInfo, branding] = await Promise.all([
    detectDemoInfo(shellContext.isDemo, user?.id ?? '', community?.id ?? 0),
    community ? getPageShellBranding(community.id) : Promise.resolve(null),
  ]);
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
        <IdleSessionManager role={role} />
        <AppQueryProvider>
          {/* The support cookie is HttpOnly, so the banner cannot detect the
              session itself. Middleware already stamps this header on every
              request carrying a VALID, still-active support session — which is
              a stricter signal than the old `document.cookie` presence check,
              since that one also fired for an expired or revoked cookie.

              Inside AppQueryProvider because ending a session now goes through
              a TanStack mutation hook; a React Query hook outside its provider
              throws at render. */}
          <SupportBanner active={requestHeaders.get('x-support-session') === '1'} />
          <AppShell user={user} community={community} role={role} isUnitOwner={isUnitOwner} designation={designation} features={features} resourceAccess={resourceAccess} subscriptionStatus={subscriptionStatus} subscriptionCanceledAt={subscriptionCanceledAt} subscriptionCurrentPeriodEndAt={subscriptionCurrentPeriodEndAt} isDemo={shellContext.isDemo} freeAccessExpiresAt={freeAccessExpiresAt} demoInfo={demoInfo}>
            {children}
          </AppShell>
        </AppQueryProvider>
      </div>
    </>
  );
}
