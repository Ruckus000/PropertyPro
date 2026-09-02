import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { CalendarPlus, ChevronDown, FileDown, FileText, Megaphone, Trash2 } from 'lucide-react';

const MeetingPanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">Annual Members Meeting</p>
        <p className="text-xs text-content-secondary">Jun 12, 2026 · Notice mailed 14 days prior</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        Agenda, proxy form and budget packet are posted to the members-only website.
      </p>
    </div>
  </div>
);

export const GroupedActions = () => (
  <MeetingPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Meeting actions
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Annual Members Meeting</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <FileText aria-hidden="true" />
            Edit agenda
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CalendarPlus aria-hidden="true" />
            Reschedule
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Megaphone aria-hidden="true" />
            Resend notice
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileDown aria-hidden="true" />
            Export minutes
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-status-danger">
          <Trash2 aria-hidden="true" />
          Cancel meeting
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </MeetingPanel>
);
