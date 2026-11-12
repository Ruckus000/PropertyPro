'use client';

/**
 * ProfileMenu — Avatar-triggered dropdown for account actions.
 *
 * Preserves the existing lazy community-count lookup and logout flow while
 * fitting the compact avatar-only header chrome from the nav redesign.
 */
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRightLeft, CircleHelp, Download, LogOut, Plus, Settings } from 'lucide-react';
import { toInitials } from '@propertypro/shared';
import { createBrowserClient } from '@/lib/supabase/client';
import { useUserCommunityCount } from '@/hooks/use-user-community-count';
import { useAddCommunityAccess } from '@/hooks/use-add-community';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Loaded on first use: the modal brings Stripe's checkout, which no other page
// in the shell needs.
const AddCommunityModal = dynamic(
  () => import('@/components/pm/add-community-modal').then((m) => m.AddCommunityModal),
  { ssr: false },
);

interface ProfileMenuProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
}

export function ProfileMenu({ userName, userEmail, communityId }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { data: communityCount } = useUserCommunityCount(open);
  // Asked when the menu first opens; shown only to the portfolio's billing
  // owner while root in it (the same rule the Communities page and the POST use).
  const { data: addAccess } = useAddCommunityAccess(open);
  const [addOpen, setAddOpen] = useState(false);
  const [addMounted, setAddMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  const settingsHref = communityId ? `/settings?communityId=${communityId}` : '/settings';
  const helpHref = communityId ? `/help?communityId=${communityId}` : '/help';
  const exportHref = communityId
    ? `/settings/export?communityId=${communityId}`
    : '/settings/export';
  const hasMultipleCommunities = communityCount != null && communityCount > 1;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
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

          <DropdownMenuItem asChild>
            <Link href={helpHref} onClick={() => setOpen(false)}>
              <CircleHelp className="mr-2 size-4 text-content-disabled" />
              Help Center
            </Link>
          </DropdownMenuItem>

          {/* ponytail: switching takes two clicks via the profile menu. Trigger: multi-community users ask for one-click switching. */}
          {hasMultipleCommunities && (
            <DropdownMenuItem asChild>
              <Link href="/select-community" onClick={() => setOpen(false)}>
                <ArrowRightLeft className="mr-2 size-4 text-content-disabled" />
                Switch Community
              </Link>
            </DropdownMenuItem>
          )}

          {addAccess?.allowed && (
            <DropdownMenuItem
              onSelect={() => {
                setAddMounted(true);
                setAddOpen(true);
              }}
            >
              <Plus className="mr-2 size-4 text-content-disabled" />
              Add Community
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
      {addMounted && (
        <AddCommunityModal open={addOpen} onClose={() => setAddOpen(false)} returnFocusTo={triggerRef} />
      )}
    </>
  );
}
