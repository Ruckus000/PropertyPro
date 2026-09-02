import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { ChevronDown, FolderInput, UserPlus, Wrench } from 'lucide-react';

const MaintenanceToolbar = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-4 py-3">
      <p className="text-sm font-semibold text-content">Maintenance Requests</p>
      <p className="text-xs text-content-secondary">9 open · 3 unassigned · Sunset Ridge Apartments</p>
    </div>
    <div className="flex items-center gap-3 border-b border-edge bg-surface-subtle px-4 py-2">
      {children}
      <span className="text-xs text-content-secondary">3 of 9 requests selected</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-3">
      <Wrench className="size-4 shrink-0 text-content-disabled" aria-hidden="true" />
      <p className="text-sm text-content-secondary">
        Unassigned requests older than 48 hours are escalated to the site manager.
      </p>
    </div>
  </div>
);

export const NestedAssignment = () => (
  <MaintenanceToolbar>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Bulk actions
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>3 requests selected</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>
            <UserPlus aria-hidden="true" />
            Assign to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuLabel>On-site staff</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Ray Ortiz · Site Manager</DropdownMenuItem>
            <DropdownMenuItem>Dana Whitfield · Maintenance</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Gulf Coast Mechanical</DropdownMenuItem>
            <DropdownMenuItem>Bayfront Plumbing</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput aria-hidden="true" />
            Change priority
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuItem>Emergency</DropdownMenuItem>
            <DropdownMenuItem>High</DropdownMenuItem>
            <DropdownMenuItem>Routine</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Mark as completed</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </MaintenanceToolbar>
);
