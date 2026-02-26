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
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
      {/* Left: hamburger (mobile) + title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-10 items-center justify-center rounded-[10px] text-gray-500 transition-colors hover:bg-gray-100 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-lg font-semibold leading-tight text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
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
          className="flex items-center gap-2 rounded-[10px] border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-100"
          aria-label="Search"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:inline">
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
