/**
 * Site-editor route group — the shell-less layout for the v3 website editor.
 *
 * Decision B (docs/redesign/website-page/website-editor-v3-gap-analysis.md §9):
 * the editor is a full-viewport application, so it does NOT render `AppShell`.
 * Everything the shell provided and the editor still needs has to be
 * re-established here, explicitly:
 *
 *   - `AppQueryProvider` — mounted per route-group layout, never at root. A
 *     React Query hook inside a provider-less group 500s; this is the single
 *     most load-bearing line in the file.
 *   - `AuthSessionSync` / `IdleSessionManager` — session refresh and idle
 *     timeout, which `(authenticated)` gets from its own layout.
 *   - Community theme CSS variables, so the canvas renders in the community's
 *     brand rather than the default.
 *
 * NOT re-established because the ROOT layout already provides it: `<Toaster/>`
 * (`apps/web/src/app/layout.tsx`). Mounting a second one renders every toast
 * twice — the editor's undo affordances (Phase 3) reach the existing one.
 *
 * NOT re-established, by decision: the sidebar (the page renders a collapsed
 * `AppSidebar` itself, since it owns the `communityId` searchParam), the top
 * bar, the breadcrumb trail, and the billing banner strip. The lapsed-community
 * case is handled as a route gate in the page rather than a banner here.
 *
 * Authorization is the PAGE's job, not this layout's: the PM portal is
 * cross-community, so the target community arrives as a searchParam and cannot
 * be resolved at layout level. Middleware still protects the whole tree — the
 * URL lives under `/pm`, which is in `PROTECTED_PATH_PREFIXES`
 * (apps/web/src/lib/middleware/public-host-routes.ts).
 */
import type { ReactNode } from 'react';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';
import { IdleSessionManager } from '@/components/auth/idle-session-manager';
import { AppQueryProvider } from '@/components/providers/query-provider';
import { getPageShellBranding, getPageShellContext } from '@/lib/request/page-shell-context';

export const dynamic = 'force-dynamic';

export default async function SiteEditorLayout({ children }: { children: ReactNode }) {
  const shellContext = await getPageShellContext();
  const community = shellContext.community;

  // The PM portal has no tenant header, so `community` is usually null here and
  // the theme falls back to the default. When a PM is on a community subdomain
  // the branding is available and the canvas inherits it.
  const branding = community ? await getPageShellBranding(community.id) : null;
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
      <AuthSessionSync />
      <IdleSessionManager role={shellContext.role} />
      <AppQueryProvider>
        <div
          style={cssVars as React.CSSProperties}
          className="flex h-[100dvh] overflow-hidden bg-surface-page"
        >
          {children}
        </div>
      </AppQueryProvider>
    </>
  );
}
