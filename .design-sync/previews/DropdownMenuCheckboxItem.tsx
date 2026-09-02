import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { Columns3, ListFilter } from 'lucide-react';

const ArcPanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">Architectural Review Requests</p>
        <p className="text-xs text-content-secondary">17 open · 4 awaiting written denial reasons</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        HB 1203 requires every denial to cite the specific rule or covenant relied upon.
      </p>
    </div>
  </div>
);

export const StatusFilters = () => (
  <ArcPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ListFilter className="size-4" aria-hidden="true" />
          Status
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Submitted</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Under review</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Approved</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Approved with conditions</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Denied</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem disabled>Archived (Essentials plan)</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ArcPanel>
);

export const ColumnVisibility = () => (
  <ArcPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Columns3 className="size-4" aria-hidden="true" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Unit</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Submitted by</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Decision due</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Reviewer</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Covenant cited</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ArcPanel>
);
