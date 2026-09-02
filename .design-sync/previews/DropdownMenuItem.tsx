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
import { Ban, ChevronDown, Copy, Eye, Gavel, Pencil, Trash2 } from 'lucide-react';

const ViolationHeader = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">V-118 · Unapproved balcony enclosure</p>
        <p className="text-xs text-content-secondary">Unit 1204 · Hearing notice due in 6 days</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        Cited under Article XII of the declaration. 14-day hearing notice required before any fine.
      </p>
    </div>
  </div>
);

export const ItemStates = () => (
  <ViolationHeader>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Manage
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Violation actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Eye aria-hidden="true" />
          View case file
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Pencil aria-hidden="true" />
          Edit notice
          <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Copy aria-hidden="true" />
          Duplicate for another unit
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Gavel aria-hidden="true" />
          Levy fine (board vote required)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Ban aria-hidden="true" />
          Dismiss violation
        </DropdownMenuItem>
        <DropdownMenuItem className="text-status-danger">
          <Trash2 aria-hidden="true" />
          Delete record
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ViolationHeader>
);

export const InsetItems = () => (
  <ViolationHeader>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          Escalate
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel inset>Escalation path</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem inset>Send courtesy reminder</DropdownMenuItem>
        <DropdownMenuItem inset>Schedule fining committee</DropdownMenuItem>
        <DropdownMenuItem inset>Refer to association counsel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ViolationHeader>
);
