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
import { ChevronDown, Mail, MessageSquare, Printer, Send, Wrench } from 'lucide-react';

const WorkOrderPanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">WO-2041 · Pool pump failure</p>
        <p className="text-xs text-content-secondary">Unit 402 · Reported Apr 18, 2026 · High priority</p>
      </div>
      {children}
    </div>
    <div className="flex items-center gap-3 px-4 py-3">
      <Wrench className="size-4 shrink-0 text-content-disabled" aria-hidden="true" />
      <p className="text-sm text-content-secondary">
        Assigned to Gulf Coast Mechanical. Awaiting parts; next update due Apr 24.
      </p>
    </div>
  </div>
);

export const AlignEnd = () => (
  <WorkOrderPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Notify
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Notify resident</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Mail aria-hidden="true" />
          Email update
          <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <MessageSquare aria-hidden="true" />
          In-app message
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Printer aria-hidden="true" />
          Print work order
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </WorkOrderPanel>
);

export const WideContent = () => (
  <WorkOrderPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Assign vendor
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Approved vendors</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex-col items-start gap-0.5">
          <span className="text-sm text-content">Gulf Coast Mechanical</span>
          <span className="text-xs text-content-tertiary">HVAC &amp; pumps · COI valid to 12/2026</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex-col items-start gap-0.5">
          <span className="text-sm text-content">Bayfront Plumbing</span>
          <span className="text-xs text-content-tertiary">Plumbing · COI valid to 08/2026</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="flex-col items-start gap-0.5">
          <span className="text-sm text-content">Tropic Electric</span>
          <span className="text-xs text-content-tertiary">Certificate of insurance expired</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Send aria-hidden="true" />
          Request a new bid
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </WorkOrderPanel>
);
