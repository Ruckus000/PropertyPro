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
import { ChevronDown, FileDown, FolderInput, Share2 } from 'lucide-react';

const DocumentToolbar = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-4 py-3">
      <p className="text-sm font-semibold text-content">Declaration of Condominium</p>
      <p className="text-xs text-content-secondary">Governing Documents · 3.2 MB · Posted Mar 4, 2026</p>
    </div>
    <div className="flex items-center gap-3 border-b border-edge bg-surface-subtle px-4 py-2">
      {children}
      <span className="text-xs text-content-secondary">Version 4 · uploaded by Marisol Vega</span>
    </div>
    <div className="px-4 py-3">
      <p className="text-sm text-content-secondary">
        Posted 11 days after execution — inside the 30-day statutory window.
      </p>
    </div>
  </div>
);

export const CollapsedAndOpen = () => (
  <DocumentToolbar>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Actions
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Document actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Share2 aria-hidden="true" />
            Share with
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem>All residents</DropdownMenuItem>
            <DropdownMenuItem>Board members only</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>
            <FolderInput aria-hidden="true" />
            Move to category
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem>Governing Documents</DropdownMenuItem>
            <DropdownMenuItem>Financial Reports</DropdownMenuItem>
            <DropdownMenuItem>Meeting Notices</DropdownMenuItem>
            <DropdownMenuItem>Insurance &amp; Reserves</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <FileDown aria-hidden="true" />
          Download PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </DocumentToolbar>
);

export const InsetSubTrigger = () => (
  <DocumentToolbar>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          Export
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel inset>Export options</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem inset>Download original</DropdownMenuItem>
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger inset>Compliance packet</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem>Governing documents only</DropdownMenuItem>
            <DropdownMenuItem>Full §718.111(12) packet</DropdownMenuItem>
            <DropdownMenuItem>Board-requested subset</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  </DocumentToolbar>
);
