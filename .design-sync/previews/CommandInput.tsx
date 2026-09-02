import type { ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@propertypro/design-system';
import { FileText, Home, Users } from 'lucide-react';

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

export const EmptyQuery = () => (
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
          <CommandItem value="residents">
            <Users aria-hidden="true" />
            Residents
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </Palette>
);

export const TypedQuery = () => (
  <Palette>
    <Command>
      <CommandInput value="reserve" placeholder="Search pages, residents, documents…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Documents">
          <CommandItem value="Structural Integrity Reserve Study">
            <FileText aria-hidden="true" />
            Structural Integrity Reserve Study
          </CommandItem>
          <CommandItem value="Reserve funding disclosure 2026">
            <FileText aria-hidden="true" />
            Reserve Funding Disclosure (2026)
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </Palette>
);
