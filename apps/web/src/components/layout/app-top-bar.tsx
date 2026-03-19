'use client';

/**
 * AppTopBar — Top header bar with page title, search, and user menu.
 *
 * Matches the mockup TopBar: 64px height, white background, border-bottom.
 * On mobile: shows hamburger to open sidebar drawer.
 */
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { NAV_ITEMS, PM_NAV_ITEMS, PAGE_TITLES, getActiveItemId } from './nav-config';
import { UserMenu } from './user-menu';
import { useSidebar } from './sidebar-context';

interface AppTopBarProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
  onSearchOpen?: () => void;
}

export function AppTopBar({ userName, userEmail, communityId, onSearchOpen }: AppTopBarProps) {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();

  const isPmContext = pathname.startsWith('/pm/');
  const items = isPmContext ? PM_NAV_ITEMS : NAV_ITEMS;
  const activeId = getActiveItemId(items, pathname);
  const pageInfo = activeId ? PAGE_TITLES[activeId] : null;

  // Fallback title from pathname
  const title = pageInfo?.title ?? deriveTitleFromPathname(pathname);
  const subtitle = pageInfo?.subtitle ?? '';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge bg-surface-card px-4 lg:px-8">
      {/* Left: hamburger (mobile) + title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-10 items-center justify-center rounded-md text-content-tertiary transition-colors duration-quick hover:bg-surface-muted lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-xl font-semibold leading-tight text-content">{title}</h1>
          {subtitle && (
            <p className="text-sm font-medium uppercase tracking-wider text-content-secondary">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: search + user menu */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSearchOpen}
          className="flex min-h-9 items-center gap-2 rounded-md border border-edge bg-surface-page px-3 py-1.5 text-sm text-content-placeholder transition-colors duration-quick hover:border-edge-strong hover:bg-surface-muted"
          aria-label="Search"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden rounded border border-edge bg-surface-card px-1.5 py-0.5 text-xs font-medium text-content-tertiary sm:inline">
            ⌘K
          </kbd>
        </button>
        <UserMenu userName={userName} userEmail={userEmail} communityId={communityId} />
      </div>
    </header>
  );
}

function deriveTitleFromPathname(pathname: string): string {
  if (pathname.startsWith('/settings/export')) return 'Data Export';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/dashboard/apartment')) return 'Dashboard';
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  // Extract last meaningful segment
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return 'Dashboard';
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
