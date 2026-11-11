'use client';

/**
 * AppTopBar — Search-dominant shell header.
 *
 * Desktop is a single utility row with search, notifications, and the avatar
 * profile menu. A phone navigates with the tab row under this bar (ShellTopNav),
 * so with a community (or the PM portfolio) in scope the bar shows the community
 * name and collapses search to an icon. With neither in scope there are no tabs, so
 * the hamburger and its drawer (the community picker) stay as the way in.
 */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CircleHelp, Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tabsInScope } from './nav-config';
import { useHelpWidget } from '@/components/help/help-widget-provider';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ProfileMenu } from './profile-menu';
import { useSidebar } from './sidebar-context';

interface AppTopBarProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
  onSearchOpen?: () => void;
  /** Brand tile + community name (+ plan from `lg`), first in the row when the tabs are in scope. */
  brand?: ReactNode;
  /** The top-nav flag is on: the brand also shows at `lg` and up (the rail's header is not rendered). */
  brandAtDesktop?: boolean;
}

export function AppTopBar({ userName, userEmail, communityId, onSearchOpen, brand, brandAtDesktop = false }: AppTopBarProps) {
  const { setMobileOpen } = useSidebar();
  const pathname = usePathname();
  const tabsOnPhone = tabsInScope(communityId !== null, pathname);
  const { toggle: toggleHelp } = useHelpWidget();

  return (
    <header className="shrink-0 border-b border-edge bg-surface-card">
      <div className="flex h-16 items-center gap-2 px-4 lg:h-14 lg:gap-3 lg:px-6">
        {!tabsOnPhone && (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        )}

        {brand && tabsOnPhone ? (
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center',
              brandAtDesktop ? 'lg:flex-none lg:shrink-0' : 'lg:hidden',
            )}
          >
            {brand}
          </div>
        ) : null}

        <div
          role="search"
          className={cn('flex lg:min-w-0 lg:flex-1 lg:max-w-[560px]', tabsOnPhone ? 'flex-none' : 'min-w-0 flex-1')}
        >
          <button
            type="button"
            onClick={onSearchOpen}
            className={cn(
              'flex h-11 min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] border bg-surface-card text-sm text-content-placeholder transition-colors duration-quick hover:border-edge-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:h-10 lg:w-full',
              tabsOnPhone
                ? 'w-11 justify-center border-transparent px-0 lg:justify-start lg:border-edge lg:px-3.5'
                : 'w-full border-edge px-3.5',
            )}
            aria-label="Search documents, residents, meetings"
          >
            <Search size={16} aria-hidden="true" />
            <span className={cn('flex-1 truncate text-left', tabsOnPhone && 'hidden lg:block')}>
              Search documents, residents, meetings...
            </span>
            <kbd className="hidden rounded border border-edge bg-surface-page px-1.5 py-0.5 text-xs font-medium text-content-tertiary lg:inline-flex">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
          <button
            type="button"
            onClick={toggleHelp}
            className="flex size-11 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:size-9"
            aria-label="Open help"
            title="Help (?)"
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <NotificationBell communityId={communityId} />
          <ProfileMenu userName={userName} userEmail={userEmail} communityId={communityId} />
        </div>
      </div>
    </header>
  );
}
