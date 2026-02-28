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
import { X } from 'lucide-react';
import type { CommunityRole, CommunityFeatures, CommunityType } from '@propertypro/shared';
import { AppSidebar } from './app-sidebar';
import { AppTopBar } from './app-top-bar';
import { CommandPalette } from './command-palette';
import { SidebarProvider, useSidebar } from './sidebar-context';

export interface AppShellUser {
  id: string;
  fullName: string | null;
  email: string | null;
}

export interface AppShellCommunity {
  id: number;
  name: string;
  type: CommunityType;
}

interface AppShellProps {
  children: ReactNode;
  user: AppShellUser | null;
  community: AppShellCommunity | null;
  role: CommunityRole | null;
  features: CommunityFeatures | null;
}

function ShellInner({ children, user, community, role, features }: AppShellProps) {
  const { expanded, mobileOpen, setMobileOpen } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-page,#F9FAFB)]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AppSidebar
          communityId={community?.id ?? null}
          communityName={community?.name ?? null}
          communityType={community?.type ?? null}
          role={role}
          features={features}
          userName={user?.fullName ?? null}
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
              communityId={community?.id ?? null}
              communityName={community?.name ?? null}
              communityType={community?.type ?? null}
              role={role}
              features={features}
              userName={user?.fullName ?? null}
            />
            <button
              type="button"
              onClick={closeMobileNav}
              className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-[10px] text-white/60 transition-colors hover:text-white"
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
          onSearchOpen={() => setSearchOpen(true)}
        />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        communityId={community?.id ?? null}
        role={role}
        features={features}
      />
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
