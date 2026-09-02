import type { ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@propertypro/design-system';
import {
  ArrowUpDown,
  ChevronDown,
  Download,
  Eye,
  FileText,
  FolderInput,
  Gavel,
  Link2,
  ListFilter,
  Trash2,
  Upload,
} from 'lucide-react';

const documents = [
  { name: 'Declaration of Condominium', meta: 'Governing Documents · Posted Mar 4, 2026' },
  { name: 'Q1 2026 Board Meeting Minutes', meta: 'Meetings · Posted Apr 12, 2026' },
  { name: 'Structural Integrity Reserve Study', meta: 'Reserves · Posted Jan 22, 2026' },
];

const violations = [
  { name: 'V-118 · Unapproved balcony enclosure', meta: 'Unit 1204 · Hearing notice due in 6 days' },
  { name: 'V-117 · Commercial vehicle in guest parking', meta: 'Unit 806 · Courtesy notice sent Apr 9, 2026' },
  { name: 'V-112 · Unleashed pet in common areas', meta: 'Unit 311 · Cured Apr 2, 2026' },
];

const DocumentsPanel = ({
  title = 'Association Documents',
  subtitle = 'Sunset Condos · 42 records posted',
  rows = documents,
  icon: RowIcon = FileText,
  children,
}: {
  title?: string;
  subtitle?: string;
  rows?: { name: string; meta: string }[];
  icon?: typeof FileText;
  children: ReactNode;
}) => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">{title}</p>
        <p className="text-xs text-content-secondary">{subtitle}</p>
      </div>
      {children}
    </div>
    <ul className="divide-y divide-edge-subtle">
      {rows.map((doc) => (
        <li key={doc.name} className="flex items-center gap-3 px-4 py-3">
          <RowIcon className="size-4 shrink-0 text-content-disabled" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-content">{doc.name}</p>
            <p className="text-xs text-content-tertiary">{doc.meta}</p>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

export const DocumentActions = () => (
  <DocumentsPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Actions
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Declaration of Condominium</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Eye aria-hidden="true" />
            View document
            <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Download aria-hidden="true" />
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link2 aria-hidden="true" />
            Copy public link
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Upload aria-hidden="true" />
            Replace file
          </DropdownMenuItem>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>
              <FolderInput aria-hidden="true" />
              Move to category
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              <DropdownMenuItem>Governing Documents</DropdownMenuItem>
              <DropdownMenuItem>Financial Reports</DropdownMenuItem>
              <DropdownMenuItem>Meeting Notices</DropdownMenuItem>
              <DropdownMenuItem>Insurance &amp; Reserves</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-status-danger">
          <Trash2 aria-hidden="true" />
          Delete document
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </DocumentsPanel>
);

export const ViolationFilters = () => (
  <DocumentsPanel
    title="Violations"
    subtitle="Sunset Condos · 11 open · 4 hearings scheduled"
    rows={violations}
    icon={Gavel}
  >
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ListFilter className="size-4" aria-hidden="true" />
          Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Violation status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Open notices</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Hearing scheduled</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Cured</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Dismissed by board</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem disabled>Fined (requires Operations+)</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </DocumentsPanel>
);

export const SortOrder = () => (
  <DocumentsPanel>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowUpDown className="size-4" aria-hidden="true" />
          Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sort documents by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="posted">
          <DropdownMenuRadioItem value="posted">Date posted</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="created">Date created</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="title">Title (A–Z)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="category">Category</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </DocumentsPanel>
);
