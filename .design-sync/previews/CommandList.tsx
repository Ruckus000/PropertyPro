import type { ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@propertypro/design-system';
import {
  CalendarDays,
  FileText,
  Gavel,
  Home,
  Megaphone,
  PencilRuler,
  Receipt,
  Settings,
  Users,
  Wrench,
} from 'lucide-react';

const Palette = ({ children }: { children: ReactNode }) => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e3">
    {children}
    <div className="flex items-center justify-between border-t border-edge px-3 py-2 text-xs text-content-tertiary">
      <span>Sunset Condos</span>
      <span className="flex items-center gap-3">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </span>
    </div>
  </div>
);

export const ScrollingResults = () => (
  <Palette>
    <Command>
      <CommandInput placeholder="Search pages, residents, documents…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem value="dashboard">
            <Home aria-hidden="true" />
            Dashboard
          </CommandItem>
          <CommandItem value="documents">
            <FileText aria-hidden="true" />
            Documents
          </CommandItem>
          <CommandItem value="meetings">
            <CalendarDays aria-hidden="true" />
            Meetings &amp; Notices
          </CommandItem>
          <CommandItem value="announcements">
            <Megaphone aria-hidden="true" />
            Announcements
          </CommandItem>
          <CommandItem value="violations">
            <Gavel aria-hidden="true" />
            Violations
          </CommandItem>
          <CommandItem value="architectural review">
            <PencilRuler aria-hidden="true" />
            Architectural Review
          </CommandItem>
          <CommandItem value="maintenance">
            <Wrench aria-hidden="true" />
            Maintenance
          </CommandItem>
          <CommandItem value="assessments">
            <Receipt aria-hidden="true" />
            Assessments
          </CommandItem>
          <CommandItem value="residents">
            <Users aria-hidden="true" />
            Residents
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem value="settings">
            <Settings aria-hidden="true" />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </Palette>
);
