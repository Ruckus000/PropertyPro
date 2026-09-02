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
import { Download, FileText, Megaphone, Upload, Wrench } from 'lucide-react';

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

export const ItemStates = () => (
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
          </CommandItem>
          <CommandItem value="submit maintenance request">
            <Wrench aria-hidden="true" />
            Submit maintenance request
          </CommandItem>
          <CommandItem value="export compliance packet" disabled>
            <Download aria-hidden="true" />
            Export compliance packet (Professional plan)
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Documents">
          <CommandItem value="declaration of condominium">
            <FileText aria-hidden="true" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-sm text-content">Declaration of Condominium</span>
              <span className="text-xs text-content-tertiary">Governing Documents · Mar 4, 2026</span>
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </Palette>
);
