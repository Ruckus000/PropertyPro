'use client';

/**
 * AppTopBar — Search-dominant shell header with mobile drawer trigger.
 *
 * Search stays primary across breakpoints. Mobile keeps the hamburger trigger,
 * while desktop collapses to a single utility row with search, notifications,
 * and the avatar profile menu.
 */
import { Menu, Search } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ProfileMenu } from './profile-menu';
import { useSidebar } from './sidebar-context';

interface AppTopBarProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
  onSearchOpen?: () => void;
}

export function AppTopBar({ userName, userEmail, communityId, onSearchOpen }: AppTopBarProps) {
  const { setMobileOpen } = useSidebar();

  return (
    <header className="shrink-0 border-b border-edge bg-surface-card">
      <div className="flex h-16 items-center gap-2 px-4 lg:h-14 lg:gap-3 lg:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <div role="search" className="flex min-w-0 flex-1 lg:max-w-[560px]">
          <button
            type="button"
            onClick={onSearchOpen}
            className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] border border-edge bg-surface-card px-3.5 text-sm text-content-placeholder transition-colors duration-quick hover:border-edge-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:h-10"
            aria-label="Search documents, residents, meetings"
          >
            <Search size={16} aria-hidden="true" />
            <span className="flex-1 truncate text-left">
              Search documents, residents, meetings...
            </span>
            <kbd className="hidden rounded border border-edge bg-surface-page px-1.5 py-0.5 text-xs font-medium text-content-tertiary lg:inline-flex">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
          <NotificationBell communityId={communityId} />
          <ProfileMenu userName={userName} userEmail={userEmail} communityId={communityId} />
        </div>
      </div>
    </header>
  );
}
