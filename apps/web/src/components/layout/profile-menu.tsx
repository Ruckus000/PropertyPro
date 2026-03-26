'use client';

/**
 * ProfileMenu — Avatar-triggered dropdown for account actions.
 *
 * Preserves the existing lazy community-count lookup and logout flow while
 * fitting the compact avatar-only header chrome from the nav redesign.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Download, LogOut, Settings } from 'lucide-react';
import { toInitials } from '@propertypro/shared';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ProfileMenuProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
}

export function ProfileMenu({ userName, userEmail, communityId }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [communityCount, setCommunityCount] = useState<number | null>(null);
  const [hasFetchedCommunities, setHasFetchedCommunities] = useState(false);

  useEffect(() => {
    if (!open || hasFetchedCommunities) return;

    setHasFetchedCommunities(true);
    fetch('/api/v1/user/communities')
      .then((res) => res.json())
      .then((json: { data?: { count?: number } }) => {
        setCommunityCount(json.data?.count ?? 0);
      })
      .catch(() => {
        setCommunityCount(0);
      });
  }, [open, hasFetchedCommunities]);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  const settingsHref = communityId ? `/settings?communityId=${communityId}` : '/settings';
  const exportHref = communityId
    ? `/settings/export?communityId=${communityId}`
    : '/settings/export';
  const hasMultipleCommunities = communityCount != null && communityCount > 1;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge bg-surface-card text-content transition-colors duration-quick hover:border-edge-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 lg:h-9 lg:w-9',
          )}
          title={userEmail ?? undefined}
          aria-label={userName ? `${userName} account menu` : 'Account menu'}
          aria-haspopup="menu"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-[var(--interactive-primary)]/10 text-xs font-semibold text-[var(--interactive-primary)] lg:size-7">
            {toInitials(userName)}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={settingsHref} onClick={() => setOpen(false)}>
            <Settings className="mr-2 size-4 text-content-disabled" />
            Settings
          </Link>
        </DropdownMenuItem>

        {hasMultipleCommunities && (
          <DropdownMenuItem asChild>
            <Link href="/select-community" onClick={() => setOpen(false)}>
              <ArrowRightLeft className="mr-2 size-4 text-content-disabled" />
              Switch Community
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <Link href={exportHref} onClick={() => setOpen(false)}>
            <Download className="mr-2 size-4 text-content-disabled" />
            Data Export
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={loggingOut}
          onClick={() => {
            void handleLogout();
          }}
        >
          <LogOut className="mr-2 size-4 text-content-disabled" />
          {loggingOut ? 'Logging out...' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
