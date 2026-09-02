import type { ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@propertypro/design-system';
import { Megaphone, Search, Upload, Users, Wrench } from 'lucide-react';

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

export const ShortcutHints = () => (
  <Palette>
    <Command>
      <CommandInput placeholder="Search pages, residents, documents…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
          <CommandItem value="submit maintenance request">
            <Wrench aria-hidden="true" />
            Submit maintenance request
            <CommandShortcut>⌘M</CommandShortcut>
          </CommandItem>
          <CommandItem value="invite resident">
            <Users aria-hidden="true" />
            Invite a resident
            <CommandShortcut>⌘⇧I</CommandShortcut>
          </CommandItem>
          <CommandItem value="search everything">
            <Search aria-hidden="true" />
            Search everything
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </Palette>
);
