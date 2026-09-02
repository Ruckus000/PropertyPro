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
import { ChevronDown, ShieldCheck, UserCog } from 'lucide-react';

const RolesToolbar = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-4 py-3">
      <p className="text-sm font-semibold text-content">Roles &amp; Access</p>
      <p className="text-xs text-content-secondary">Marisol Vega · marisol.vega@sunset.example</p>
    </div>
    <div className="flex items-center gap-3 border-b border-edge bg-surface-subtle px-4 py-2">
      {children}
      <span className="text-xs text-content-secondary">Property manager · joined Feb 2024</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-3">
      <ShieldCheck className="size-4 shrink-0 text-content-disabled" aria-hidden="true" />
      <p className="text-sm text-content-secondary">
        Only the root manager can assign roles or transfer ownership of a community.
      </p>
    </div>
  </div>
);

export const NestedRoleAssignment = () => (
  <RolesToolbar>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Manage access
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Marisol Vega</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>
            <UserCog aria-hidden="true" />
            Change role
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            <DropdownMenuLabel>Community role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Resident · unit owner</DropdownMenuItem>
            <DropdownMenuItem>Resident · tenant</DropdownMenuItem>
            <DropdownMenuItem>Property manager</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Root manager (transfer required)</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Set board designation</DropdownMenuItem>
        <DropdownMenuItem className="text-status-danger">Remove from community</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </RolesToolbar>
);
