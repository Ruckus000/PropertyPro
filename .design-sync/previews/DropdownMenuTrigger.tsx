import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import {
  ArrowRightLeft,
  ChevronDown,
  CircleHelp,
  Download,
  LogOut,
  MoreHorizontal,
  Settings,
} from 'lucide-react';

const AppHeader = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-content">Sunset Condos</span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-secondary">
          Professional
        </span>
      </div>
      {children}
    </div>
    <div className="px-4 py-4">
      <p className="text-sm text-content-secondary">
        Compliance score 94% · 2 documents approaching the 30-day posting deadline.
      </p>
    </div>
  </div>
);

export const AvatarTrigger = () => (
  <AppHeader>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Marisol Vega account menu"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-edge bg-surface-card"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-interactive-subtle text-xs font-semibold text-interactive">
            MV
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem>
          <Settings aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CircleHelp aria-hidden="true" />
          Help Center
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ArrowRightLeft aria-hidden="true" />
          Switch Community
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Download aria-hidden="true" />
          Data Export
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </AppHeader>
);

export const ButtonTrigger = () => (
  <AppHeader>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Board actions
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Board of Directors</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Post a meeting notice</DropdownMenuItem>
        <DropdownMenuItem>Record meeting minutes</DropdownMenuItem>
        <DropdownMenuItem>Start an election</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </AppHeader>
);

export const IconOnlyTrigger = () => (
  <AppHeader>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Community options">
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem>Edit community profile</DropdownMenuItem>
        <DropdownMenuItem>Manage residents</DropdownMenuItem>
        <DropdownMenuItem>Transparency settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </AppHeader>
);
