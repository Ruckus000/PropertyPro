import type { ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@propertypro/design-system';
import { FileText, Gavel, SearchX, Users } from 'lucide-react';

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

export const NoResults = () => (
  <Palette>
    <Command>
      <CommandInput value="seawall permit" placeholder="Search pages, residents, documents…" />
      <CommandList>
        <CommandEmpty>
          <span className="flex flex-col items-center gap-2 px-4">
            <SearchX className="size-5 text-content-disabled" aria-hidden="true" />
            <span className="text-sm font-medium text-content">
              No matches for &ldquo;seawall permit&rdquo;
            </span>
            <span className="text-xs text-content-secondary">
              Try a unit number, a resident name, or a document title.
            </span>
          </span>
        </CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem value="documents">
            <FileText aria-hidden="true" />
            Documents
          </CommandItem>
          <CommandItem value="violations">
            <Gavel aria-hidden="true" />
            Violations
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
