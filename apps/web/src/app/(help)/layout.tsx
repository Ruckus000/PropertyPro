import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';
import { IdleSessionManager } from '@/components/auth/idle-session-manager';
import { AppQueryProvider } from '@/components/providers/query-provider';
import { SupportBanner } from '@/components/support/SupportBanner';
import { getPageShellBranding, getPageShellContext } from '@/lib/request/page-shell-context';

export const dynamic = 'force-dynamic';

/**
 * The Help Center is its own site: its own header ("Back to PropertyPro"),
 * topic sidebar and painted titles, so it sits outside the app shell rather
 * than stacking a second chrome inside it. It keeps everything else the
 * (authenticated) layout provides — community theme, session sync, idle
 * timeout, support banner and the query provider.
 *
 * Not a security boundary: every page resolves its own membership through
 * requireHelpPageContext, and middleware protects /help.
 */
export default async function HelpCenterLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const shellContext = await getPageShellContext();
  const { user, community, role } = shellContext;

  if (!community && requestHeaders.get('x-community-id') && user) {
    redirect('/select-community');
  }

  const branding = community ? await getPageShellBranding(community.id) : null;
  const theme = community
    ? resolveTheme(branding, community.name, community.type)
    : resolveTheme(null, '', 'condo_718');

  return (
    <>
      {toFontLinks(theme).map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={toCssVars(theme) as React.CSSProperties}>
        <AuthSessionSync />
        <IdleSessionManager role={role} />
        <AppQueryProvider>
          <SupportBanner active={requestHeaders.get('x-support-session') === '1'} />
          {children}
        </AppQueryProvider>
      </div>
    </>
  );
}
