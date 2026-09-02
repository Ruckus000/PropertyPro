import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { CalendarClock, ChevronDown, Send } from 'lucide-react';

const BroadcastToolbar = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-4 py-3">
      <p className="text-sm font-semibold text-content">Emergency Broadcast</p>
      <p className="text-xs text-content-secondary">Hurricane preparedness · 120 units reachable</p>
    </div>
    <div className="flex items-center gap-3 border-b border-edge bg-surface-subtle px-4 py-2">
      {children}
      <span className="text-xs text-content-secondary">Draft · not yet sent</span>
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        Storm shutters must be closed by 6:00 PM Thursday. Garage level 1 floods first — move
        vehicles to level 3 or higher.
      </p>
    </div>
  </div>
);

export const PortalledSubmenu = () => (
  <BroadcastToolbar>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Send broadcast
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Delivery</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Send aria-hidden="true" />
          Send now
        </DropdownMenuItem>
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>
            <CalendarClock aria-hidden="true" />
            Schedule for
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuItem>In 1 hour</DropdownMenuItem>
              <DropdownMenuItem>Tonight at 6:00 PM</DropdownMenuItem>
              <DropdownMenuItem>Tomorrow at 8:00 AM</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Pick a date and time…</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Save as draft</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </BroadcastToolbar>
);
