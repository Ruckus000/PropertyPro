import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { ChevronDown, ListFilter } from 'lucide-react';

const ResidentsPanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">Residents</p>
        <p className="text-xs text-content-secondary">Palm Shores HOA · 218 owners, 46 tenants</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        Owner-of-record data feeds the statutory member directory and voting eligibility.
      </p>
    </div>
  </div>
);

export const SectionLabel = () => (
  <ResidentsPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Add resident
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Add a resident</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Invite unit owner by email</DropdownMenuItem>
        <DropdownMenuItem>Invite tenant by email</DropdownMenuItem>
        <DropdownMenuItem>Import owners from CSV</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Pending</DropdownMenuLabel>
        <DropdownMenuItem>Review 3 access requests</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ResidentsPanel>
);

export const InsetLabel = () => (
  <ResidentsPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ListFilter className="size-4" aria-hidden="true" />
          Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel inset>Show residents who are</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Unit owners</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Tenants</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Board designees</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ResidentsPanel>
);
