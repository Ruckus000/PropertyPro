import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { ArrowUpDown, ChevronDown } from 'lucide-react';

const AnnouncementsPanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">Announcements</p>
        <p className="text-xs text-content-secondary">28 published · 2 pinned to the resident feed</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        Pinned notices stay above the fold until their expiry date passes.
      </p>
    </div>
  </div>
);

export const SortSelection = () => (
  <AnnouncementsPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ArrowUpDown className="size-4" aria-hidden="true" />
          Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="published">
          <DropdownMenuRadioItem value="published">Newest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="pinned">Pinned first</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </AnnouncementsPanel>
);

export const AudienceSelection = () => (
  <AnnouncementsPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Audience
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Who can see this post</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="all">
          <DropdownMenuRadioItem value="all">All residents</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="owners">Unit owners only</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="tenants">Tenants only</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="board">Board members only</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </AnnouncementsPanel>
);
