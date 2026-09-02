import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { ChevronDown } from 'lucide-react';

const ReservePanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">Structural Integrity Reserve Study</p>
        <p className="text-xs text-content-secondary">Building A · 8 storeys · Last study Jan 2026</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        PropertyPro reports the figures on file. It does not assess whether funding is adequate.
      </p>
    </div>
  </div>
);

export const FundingBasis = () => (
  <ReservePanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Reporting basis
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Display reserves as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="component">
          <DropdownMenuRadioItem value="component">Component method</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="pooled">Pooled (cash-flow) method</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="straight">Straight-line by asset</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="none" disabled>
            Waived funding (not permitted)
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </ReservePanel>
);
