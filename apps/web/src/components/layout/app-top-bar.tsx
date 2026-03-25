'use client';

/**
 * AppTopBar — Utility header with prominent search bar and user menu.
 *
 * Matches the redesigned header: 56px height, no page title,
 * centered search bar trigger that opens the command palette.
 * On mobile: two-row layout with search bar below hamburger + avatar.
 */
import { Menu, Search } from 'lucide-react';
import { UserMenu } from './user-menu';
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
      {/* Desktop layout */}
      <div className="hidden h-14 items-center gap-4 px-6 lg:flex">
        <div role="search" className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={onSearchOpen}
            className="flex h-10 w-full max-w-[560px] items-center gap-2.5 rounded-[var(--radius-md)] border border-edge bg-surface-page px-3.5 text-sm text-content-placeholder transition-colors duration-quick hover:border-edge-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Search — press Command K to open"
          >
            <Search size={16} aria-hidden="true" />
            <span className="flex-1 text-left">Search documents, meetings, residents...</span>
            <kbd className="rounded border border-edge bg-surface-card px-1.5 py-0.5 text-xs font-medium text-content-tertiary">
              ⌘K
            </kbd>
          </button>
        </div>
        <UserMenu userName={userName} userEmail={userEmail} communityId={communityId} />
      </div>

      {/* Mobile layout — two rows */}
      <div className="lg:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-10 items-center justify-center rounded-md text-content-tertiary transition-colors duration-quick hover:bg-surface-muted"
            aria-label="Open navigation"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <UserMenu userName={userName} userEmail={userEmail} communityId={communityId} />
        </div>
        <div className="px-4 pb-3" role="search">
          <button
            type="button"
            onClick={onSearchOpen}
            className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-md)] border border-edge bg-surface-page px-3 text-sm text-content-placeholder transition-colors duration-quick hover:border-edge-strong"
            aria-label="Search"
          >
            <Search size={16} aria-hidden="true" />
            <span>Search documents, residents...</span>
          </button>
        </div>
      </div>
    </header>
  );
}
