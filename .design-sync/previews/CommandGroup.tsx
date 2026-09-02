import type { ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@propertypro/design-system';
import { Clock, FileText, Megaphone, Receipt, Upload, Users } from 'lucide-react';

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

export const GroupedResults = () => (
  <Palette>
    <Command>
      <CommandInput placeholder="Search pages, residents, documents…" />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Recent">
          <CommandItem value="recent assessments">
            <Clock aria-hidden="true" />
            Assessments
          </CommandItem>
          <CommandItem value="recent residents">
            <Clock aria-hidden="true" />
            Residents
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pages">
          <CommandItem value="documents">
            <FileText aria-hidden="true" />
            Documents
          </CommandItem>
          <CommandItem value="residents page">
            <Users aria-hidden="true" />
            Residents
          </CommandItem>
          <CommandItem value="assessments page">
            <Receipt aria-hidden="true" />
            Assessments
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
    </Command>
  </Palette>
);
