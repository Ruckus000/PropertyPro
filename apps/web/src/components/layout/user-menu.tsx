'use client';

/**
 * UserMenu — Dropdown menu with user info, settings links, and logout.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { LogOut, Settings, Download, ChevronDown, ArrowRightLeft } from 'lucide-react';
import { toInitials } from '@propertypro/shared';
import { createBrowserClient } from '@/lib/supabase/client';

interface UserMenuProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
}

export function UserMenu({ userName, userEmail, communityId }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [communityCount, setCommunityCount] = useState<number | null>(null);
  const [hasFetchedCommunities, setHasFetchedCommunities] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  // Fetch community count when menu opens for the first time
  useEffect(() => {
    if (!open || hasFetchedCommunities) return;
    setHasFetchedCommunities(true);
    fetch('/api/v1/user/communities')
      .then((res) => res.json())
      .then((json) => setCommunityCount(json.data?.count ?? 0))
      .catch(() => setCommunityCount(0));
  }, [open, hasFetchedCommunities]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    // AuthSessionSync handles the redirect on SIGNED_OUT with returnTo logic
  }

  const settingsHref = communityId ? `/settings?communityId=${communityId}` : '/settings';
  const exportHref = communityId
    ? `/settings/export?communityId=${communityId}`
    : '/settings/export';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="flex size-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
          {toInitials(userName)}
        </div>
        <span className="hidden font-medium sm:inline">{userName ?? 'Account'}</span>
        <ChevronDown
          size={14}
          className={`hidden text-gray-400 transition-transform duration-150 sm:inline ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-[10px] border border-gray-200 bg-white py-1 shadow-md"
          role="menu"
        >
          {/* User info header */}
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
            {userEmail && (
              <p className="truncate text-xs text-gray-500">{userEmail}</p>
            )}
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              href={settingsHref}
              onClick={close}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              role="menuitem"
            >
              <Settings size={14} className="text-gray-400" />
              Settings
            </Link>
            <Link
              href={exportHref}
              onClick={close}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              role="menuitem"
            >
              <Download size={14} className="text-gray-400" />
              Data Export
            </Link>
          </div>

          {communityCount != null && communityCount > 1 && (
            <div className="border-t border-gray-100 py-1">
              <Link
                href="/select-community"
                onClick={close}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                role="menuitem"
              >
                <ArrowRightLeft size={14} className="text-gray-400" />
                Switch Community
              </Link>
            </div>
          )}

          <div className="border-t border-gray-100 py-1">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              role="menuitem"
            >
              <LogOut size={14} className="text-gray-400" />
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
