'use client';

/**
 * AppShell — Authenticated layout shell with sidebar + top bar.
 *
 * Composition:
 *   ┌──────────┬──────────────────────┐
 *   │ Sidebar  │ TopBar               │
 *   │          ├──────────────────────┤
 *   │          │ <main> (scrollable)  │
 *   │          │   {children}         │
 *   │          │                      │
 *   └──────────┴──────────────────────┘
 *
 * On mobile (<1024px): sidebar hidden, drawer overlay.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { PlanBadge } from '@propertypro/ui';
import { PLAN_FEATURES, resolveLifecycleState, resolvePlanId } from '@propertypro/shared';
import type { CommunityRole, CommunityFeatures, CommunityType } from '@propertypro/shared';
import type { ResourceAccessMap } from '@/lib/db/access-control';
import { AppSidebar } from './app-sidebar';
import { AppTopBar } from './app-top-bar';
import { TOP_NAV_ENABLED } from './top-nav-flag';
import { PageContainer, PAGE_GUTTER_X } from './page-container';
import { ShellBreadcrumbs } from './shell-breadcrumbs';
import { SidebarProvider, useSidebar } from './sidebar-context';
import { HelpWidgetProvider } from '@/components/help/help-widget-provider';
import { HelpWidget } from '@/components/help/help-widget';
import { HelpDeepLinkHandler } from '@/components/help/help-deep-link-handler';
import { PageHeaderHelpButton } from '@/components/shared/page-header-help-button';
import { FreeAccessBanner } from '@/components/banners/free-access-banner';
import { SubscriptionBillingBanners } from '@/components/billing/subscription-billing-banners';
import { DemoTrialBanner } from '@/components/demo/DemoTrialBanner';
import type { DemoDetectionResult } from '@/lib/demo/detect-demo-info';
import { isSearchShortcut } from '@/lib/utils/search-shortcut';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PropertyProTile } from '@/components/brand/property-pro-mark';
import type { ShellTopNavProps } from './top-nav-shell';

interface HelpDocsModalProps {
  communityId: number;
  flagEnabled: boolean;
}

const HelpDocsModal = dynamic<HelpDocsModalProps>(
  () => import('@/components/help/help-docs-modal').then((m) => m.HelpDocsModal),
  { ssr: false },
);

const HELP_DOCS_MODAL_ENABLED =
  process.env.NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED === 'true';

// Beside the help-modal flag, and read the same way: build-time. Defined in its
// own module (top-nav-flag.ts) so the Directory can read it without importing
// this client shell; re-exported here for callers that already import the shell.
// ponytail: two desktop navs while the flag exists. Trigger: the flag is on in production; the flip PR removes the off branch and the flag.
export { TOP_NAV_ENABLED };

// Loaded only when the flag renders it, so a flag-off build never ships the
// tab row (the web app's first-load JS ceiling has little headroom).
const ShellTopNav = dynamic<ShellTopNavProps>(
  () => import('./top-nav-shell').then((m) => m.ShellTopNav),
  { loading: () => null },
);

interface LazyCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number | null;
  role: CommunityRole | null;
  features: CommunityFeatures | null;
  resourceAccess: ResourceAccessMap | null;
  enableGlobalShortcut?: boolean;
}

const loadCommandPalette = () =>
  import('@/components/command-palette').then((module) => module.CommandPalette);

const LazyCommandPalette = dynamic<LazyCommandPaletteProps>(loadCommandPalette, {
  ssr: false,
  loading: () => null,
});

export interface AppShellUser {
  id: string;
  fullName: string | null;
  email: string | null;
}

export interface AppShellCommunity {
  id: number;
  name: string;
  type: CommunityType;
  plan: string | null;
}

interface AppShellProps {
  /** Tab row instead of the desktop rail. Defaults to the build-time flag; tests toggle it. */
  topNav?: boolean;
  children: ReactNode;
  user: AppShellUser | null;
  community: AppShellCommunity | null;
  role: CommunityRole | null;
  isUnitOwner?: boolean;
  designation?: string | null;
  features: CommunityFeatures | null;
  resourceAccess: ResourceAccessMap | null;
  subscriptionStatus?: string | null;
  subscriptionCanceledAt?: Date | null;
  subscriptionCurrentPeriodEndAt?: Date | null;
  isDemo?: boolean;
  freeAccessExpiresAt?: Date | null;
  demoInfo?: DemoDetectionResult | null;
}

/**
 * Top-bar brand (D29): the rail header's tile, the community name and the plan.
 * Not a switcher — switching stays in ProfileMenu's "Switch Community".
 */
function ShellBrand({ communityName, plan }: { communityName: string | null; plan: string | null }) {
  const planId = plan ? resolvePlanId(plan) : null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PropertyProTile />
      <span className="max-w-[16rem] truncate text-sm font-semibold text-content">
        {communityName ?? 'PropertyPro'}
      </span>
      {planId ? <PlanBadge label={PLAN_FEATURES[planId].displayName} /> : null}
    </div>
  );
}

function ShellInner({ topNav = TOP_NAV_ENABLED, children, user, community, role, isUnitOwner, designation, features, resourceAccess, subscriptionStatus, subscriptionCanceledAt, subscriptionCurrentPeriodEndAt, isDemo, freeAccessExpiresAt, demoInfo }: AppShellProps) {
  // `features` is NOT narrowed for a lapsed community — it is the full
  // type-and-plan set, same as any other state. The sidebar therefore cannot
  // infer the lapse from it and needs this flag: its type-gate filter reads raw
  // type features, and its plan-lock branch no-ops entirely when the plan is
  // null, which cancellation makes it.
  //
  // Raw lapse state, deliberately — AppSidebar combines it with the role,
  // because the API gates on the actor (see `lapsedAdmin` there).
  const isLapsed =
    resolveLifecycleState({
      subscriptionStatus: subscriptionStatus ?? null,
      subscriptionCanceledAt: subscriptionCanceledAt ?? null,
      freeAccessExpiresAt: freeAccessExpiresAt ?? null,
    }) === 'lapsed';
  const { mobileOpen, setMobileOpen } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchReady, setSearchReady] = useState(false);

  // Close mobile drawer on escape
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, setMobileOpen]);

  const closeMobileNav = useCallback(() => setMobileOpen(false), [setMobileOpen]);
  const openSearch = useCallback(() => {
    setSearchReady(true);
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isSearchShortcut(event)) {
        return;
      }

      event.preventDefault();
      setSearchReady(true);
      setSearchOpen((currentOpen) => !currentOpen);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchReady) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const requestIdle = globalThis.requestIdleCallback?.bind(globalThis);
    const cancelIdle = globalThis.cancelIdleCallback?.bind(globalThis);

    if (requestIdle && cancelIdle) {
      const idleId = requestIdle(() => {
        setSearchReady(true);
      }, { timeout: 2000 });

      return () => cancelIdle(idleId);
    }

    const timeoutId = globalThis.setTimeout(() => {
      setSearchReady(true);
    }, 1500);

    return () => globalThis.clearTimeout(timeoutId);
  }, [searchReady]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      {/* Desktop sidebar — replaced by the tab row under the top bar when the top-nav flag is on */}
      {!topNav && (
        <div className="hidden lg:block">
          <AppSidebar
            communityId={community?.id ?? null}
            communityName={community?.name ?? null}
            communityType={community?.type ?? null}
            role={role}
            isUnitOwner={isUnitOwner ?? false}
            designation={designation ?? null}
            features={features}
            isLapsed={isLapsed}
            userName={user?.fullName ?? null}
            plan={community?.plan ?? null}
          />
        </div>
      )}

      {/* Mobile drawer overlay */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[260px] border-0 bg-transparent p-0 shadow-none sm:w-[260px] sm:max-w-none [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <div className="relative z-10 h-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <AppSidebar
              expandedOverride={true}
              showCollapseToggle={false}
              onNavigate={closeMobileNav}
              communityId={community?.id ?? null}
              communityName={community?.name ?? null}
              communityType={community?.type ?? null}
              role={role}
              isUnitOwner={isUnitOwner ?? false}
              designation={designation ?? null}
              features={features}
              isLapsed={isLapsed}
              userName={user?.fullName ?? null}
              plan={community?.plan ?? null}
            />

          </div>
        </SheetContent>
      </Sheet>

      {/* Main content area — inert when mobile drawer is open to trap focus */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden" inert={mobileOpen || undefined}>
        <AppTopBar
          userName={user?.fullName ?? null}
          userEmail={user?.email ?? null}
          communityId={community?.id ?? null}
          onSearchOpen={openSearch}
          brand={
            topNav ? (
              <ShellBrand communityName={community?.name ?? null} plan={community?.plan ?? null} />
            ) : undefined
          }
        />
        {topNav && (
          <ShellTopNav
            communityId={community?.id ?? null}
            communityType={community?.type ?? null}
            role={role}
            isUnitOwner={isUnitOwner ?? false}
            features={features}
            isLapsed={isLapsed}
            plan={community?.plan ?? null}
          />
        )}
        <ShellBreadcrumbs role={role} community={community} features={features} />
        <SubscriptionBillingBanners
          role={role}
          communityId={community?.id ?? null}
          subscriptionStatus={subscriptionStatus ?? null}
          subscriptionCanceledAt={subscriptionCanceledAt ?? null}
          subscriptionCurrentPeriodEndAt={subscriptionCurrentPeriodEndAt ?? null}
          freeAccessExpiresAt={freeAccessExpiresAt ?? null}
          isDemo={isDemo ?? false}
        />
        {freeAccessExpiresAt && (
          <div className={`${PAGE_GUTTER_X} pt-4`}>
            <FreeAccessBanner expiresAt={freeAccessExpiresAt} />
          </div>
        )}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
        >
          <PageContainer className="group relative">
            {/* Per-page Help button — fallback for pages that DON'T use
                <PageHeader/>. When PageHeader is present, it renders its
                own inline Help button in the actions row and this absolute
                one hides via Tailwind's `group-has-` so they don't compete
                visually. Pages with custom h1 markup (meetings, finance,
                payments, custom dashboards, etc.) get help discoverability
                from this fallback. */}
            <div className="absolute right-10 top-10 z-10 group-has-[[data-page-header]]:hidden lg:right-12 lg:top-12">
              <PageHeaderHelpButton />
            </div>
            {children}
          </PageContainer>
        </main>
      </div>

      {searchReady && (
        <LazyCommandPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          communityId={community?.id ?? null}
          role={role}
          features={features}
          resourceAccess={resourceAccess}
          enableGlobalShortcut={false}
        />
      )}

      {demoInfo && (
        <DemoTrialBanner
          isDemoMode={demoInfo.isDemoMode}
          currentRole={demoInfo.currentRole}
          slug={demoInfo.slug}
          status={demoInfo.status}
          trialEndsAt={demoInfo.trialEndsAt}
          demoExpiresAt={demoInfo.demoExpiresAt}
          communityType={demoInfo.communityType}
        />
      )}
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  const communityId = props.community?.id ?? 0;
  const canShowHelpModal =
    HELP_DOCS_MODAL_ENABLED && props.role != null && communityId > 0;

  return (
    <SidebarProvider>
      <HelpWidgetProvider>
        <ShellInner {...props} />
        <HelpWidget communityId={communityId} />
        {/* HelpDeepLinkHandler is gated on the same flag as HelpDocsModal —
            without it, a ?help=cat/slug deep link would call openArticle()
            and trigger the legacy <HelpWidget/> drawer to open to its search
            list (not the article), producing a confusing UX during the
            Phase A → Phase B transition. */}
        {canShowHelpModal && (
          <>
            <HelpDocsModal communityId={communityId} flagEnabled />
            <HelpDeepLinkHandler />
          </>
        )}
      </HelpWidgetProvider>
    </SidebarProvider>
  );
}
