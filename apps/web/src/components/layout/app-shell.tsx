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
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { X } from 'lucide-react';
import type { AnyCommunityRole, CommunityFeatures, CommunityType } from '@propertypro/shared';
import { ADMIN_ROLES } from '@propertypro/shared';
import { AppSidebar } from './app-sidebar';
import { AppTopBar } from './app-top-bar';
import { SidebarProvider, useSidebar } from './sidebar-context';
import { AlertBanner } from '@/components/shared/alert-banner';
import { FreeAccessBanner } from '@/components/banners/free-access-banner';
import { DemoTrialBanner } from '@/components/demo/DemoTrialBanner';
import type { DemoDetectionResult } from '@/lib/demo/detect-demo-info';
import { isSearchShortcut } from '@/lib/utils/search-shortcut';

// Feature flag: set to true to use the new command palette
const USE_COMMAND_PALETTE_V2 = true;

interface LazyCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number | null;
  role: AnyCommunityRole | null;
  features: CommunityFeatures | null;
  enableGlobalShortcut?: boolean;
}

const loadCommandPalette = USE_COMMAND_PALETTE_V2
  ? () => import('@/components/command-palette').then((module) => module.CommandPalette)
  : () => import('./command-palette').then((module) => module.CommandPalette);

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
  children: ReactNode;
  user: AppShellUser | null;
  community: AppShellCommunity | null;
  role: AnyCommunityRole | null;
  features: CommunityFeatures | null;
  subscriptionStatus?: string | null;
  freeAccessExpiresAt?: Date | null;
  demoInfo?: DemoDetectionResult | null;
}

function ShellInner({ children, user, community, role, features, subscriptionStatus, freeAccessExpiresAt, demoInfo }: AppShellProps) {
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
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AppSidebar
          communityId={community?.id ?? null}
          communityName={community?.name ?? null}
          communityType={community?.type ?? null}
          role={role}
          features={features}
          userName={user?.fullName ?? null}
          plan={community?.plan ?? null}
        />
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeMobileNav}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative z-10 h-full overflow-y-auto">
            <AppSidebar
              expandedOverride={true}
              showCollapseToggle={false}
              onNavigate={closeMobileNav}
              communityId={community?.id ?? null}
              communityName={community?.name ?? null}
              communityType={community?.type ?? null}
              role={role}
              features={features}
              userName={user?.fullName ?? null}
              plan={community?.plan ?? null}
            />
            <button
              type="button"
              onClick={closeMobileNav}
              className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md text-white/60 transition-colors duration-quick hover:text-white"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main content area — inert when mobile drawer is open to trap focus */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden" inert={mobileOpen || undefined}>
        <AppTopBar
          userName={user?.fullName ?? null}
          userEmail={user?.email ?? null}
          communityId={community?.id ?? null}
          onSearchOpen={openSearch}
        />
        {(role === 'pm_admin' || role === 'property_manager_admin') && community && (
          <div className="flex items-center gap-1.5 border-b border-edge bg-surface-page px-6 py-2 lg:px-8">
            <Link
              href="/pm/dashboard/communities"
              className="flex items-center gap-1 text-sm text-content-secondary transition-colors duration-quick hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-label="Back to portfolio"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              <span>Portfolio</span>
            </Link>
            <span className="text-sm text-content-tertiary" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-content">{community.name}</span>
          </div>
        )}
        {subscriptionStatus === 'past_due' && role && (ADMIN_ROLES as readonly string[]).includes(role) && (
          <div className="px-6 pt-4 lg:px-8">
            <AlertBanner
              status="warning"
              variant="filled"
              title="Your subscription payment failed."
              description="Please update your payment method to avoid service interruption."
              action={
                <a
                  href={`/billing/portal${community ? `?communityId=${community.id}` : ''}`}
                  className="shrink-0 rounded-md border border-current px-3 py-1 text-sm font-medium transition-opacity duration-micro hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Update Payment Method
                </a>
              }
            />
          </div>
        )}
        {freeAccessExpiresAt && (
          <div className="px-6 pt-4 lg:px-8">
            <FreeAccessBanner expiresAt={freeAccessExpiresAt} />
          </div>
        )}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {searchReady && (
        <LazyCommandPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          communityId={community?.id ?? null}
          role={role}
          features={features}
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
  return (
    <SidebarProvider>
      <ShellInner {...props} />
    </SidebarProvider>
  );
}
