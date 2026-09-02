import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { ChevronDown, Megaphone, Search, Upload, Wrench } from 'lucide-react';

const DashboardPanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">Dashboard</p>
        <p className="text-xs text-content-secondary">Sunset Condos · 120 units · Miami, FL</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        3 documents due for posting this week · 2 maintenance requests unassigned · Next board
        meeting May 14.
      </p>
    </div>
  </div>
);

export const KeyboardShortcuts = () => (
  <DashboardPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Quick create
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Upload aria-hidden="true" />
          Upload document
          <DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Megaphone aria-hidden="true" />
          Post announcement
          <DropdownMenuShortcut>⌘⇧A</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Wrench aria-hidden="true" />
          New maintenance request
          <DropdownMenuShortcut>⌘M</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Search aria-hidden="true" />
          Search everything
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </DashboardPanel>
);
