import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import { ChevronDown, FileSpreadsheet, FileText, Receipt, Send, Wallet } from 'lucide-react';

const LedgerPanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">Assessments · Unit 1204</p>
        <p className="text-xs text-content-secondary">Balance $1,842.50 · 62 days delinquent</p>
      </div>
      {children}
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        Quarterly assessment $612.50 · Late fee $75.00 · Special assessment (roof) $1,155.00
      </p>
    </div>
  </div>
);

export const GroupedMenu = () => (
  <LedgerPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Ledger actions
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Billing</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Receipt aria-hidden="true" />
            Record a payment
            <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Wallet aria-hidden="true" />
            Apply credit
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Delinquency</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Send aria-hidden="true" />
            Send late notice
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileText aria-hidden="true" />
            Draft intent-to-lien letter
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileSpreadsheet aria-hidden="true" />
            Export unit ledger
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </LedgerPanel>
);
