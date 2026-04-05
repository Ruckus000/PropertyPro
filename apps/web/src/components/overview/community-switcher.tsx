'use client';

import { Building2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUserCommunities } from '@/hooks/use-user-communities';

/**
 * CommunitySwitcher — dropdown that lets a multi-community user jump to
 * the unified overview page or switch directly to one of their
 * communities' subdomains.
 *
 * Rendered in the authenticated top bar. Returns null for users with
 * fewer than 2 communities.
 */
export function CommunitySwitcher() {
  const { data } = useUserCommunities();
  const communities = data?.data ?? [];

  if (communities.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-edge bg-surface-card px-3 text-sm text-content transition-colors duration-quick hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:inline-flex"
          aria-label="Switch community"
        >
          <Building2 size={14} aria-hidden="true" />
          <span className="hidden xl:inline">Communities</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Your communities</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href="/dashboard/overview" className="cursor-pointer">
            All communities overview
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {communities.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <a
              href={`https://${c.slug}.getpropertypro.com/dashboard`}
              className="cursor-pointer"
            >
              <span className="flex-1 truncate">{c.name}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
