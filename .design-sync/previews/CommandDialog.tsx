import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@propertypro/design-system';
import { CalendarDays, FileText, Megaphone, Upload, Users } from 'lucide-react';

export const SearchDialog = () => (
  <div className="w-full max-w-[640px] rounded-md border border-edge bg-surface-card px-4 py-4">
    <p className="text-sm font-semibold text-content">Sunset Condos · Dashboard</p>
    <p className="mt-1 text-sm text-content-secondary">
      Press ⌘K anywhere in the app to open the command palette.
    </p>
    <CommandDialog open>
      <CommandInput placeholder="Search pages, residents, documents…" />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem value="documents">
            <FileText aria-hidden="true" />
            Documents
          </CommandItem>
          <CommandItem value="meetings">
            <CalendarDays aria-hidden="true" />
            Meetings &amp; Notices
          </CommandItem>
          <CommandItem value="residents">
            <Users aria-hidden="true" />
            Residents
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem value="upload document">
            <Upload aria-hidden="true" />
            Upload document
            <CommandShortcut>⌘U</CommandShortcut>
          </CommandItem>
          <CommandItem value="post announcement">
            <Megaphone aria-hidden="true" />
            Post announcement
            <CommandShortcut>⌘⇧A</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t border-edge px-3 py-2 text-xs text-content-tertiary">
        <span>Sunset Condos</span>
        <span className="flex items-center gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </span>
      </div>
    </CommandDialog>
  </div>
);
