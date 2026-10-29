'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { LinkedFacts } from '@propertypro/shared';

const LinkedFactsContext = createContext<LinkedFacts | null>(null);

/**
 * The community facts a linked field in a section's copy stands for (D4): the
 * same `{ name, shortName, city, unitCount }` the canvas resolves the page's
 * linked fields with, so a form that previews them agrees with what the canvas
 * draws.
 *
 * Takes anything shaped like the facts (the canvas's community row, for one) and
 * keeps only those four, memoised on their values, so a change elsewhere in the
 * row, a new logo for instance, does not re-render the form.
 *
 * A context rather than a prop for the reason `autosave-status` is one: the form
 * is code-split, several levels below `Inspector`, and rendered in two
 * presentations (docked column and overlay sheet). A prop would make `Inspector`,
 * `InspectorSheet` and `InspectorBody` carry a value only one form reads.
 *
 * `null` means the facts are not known, and a form then shows no preview. That is
 * also the value outside a provider, so every form stays renderable on its own.
 */
export function LinkedFactsProvider({
  facts,
  children,
}: {
  facts: LinkedFacts | null;
  children: ReactNode;
}) {
  const name = facts?.name;
  const shortName = facts?.shortName ?? null;
  const city = facts?.city ?? null;
  const unitCount = facts?.unitCount ?? null;

  const value = useMemo<LinkedFacts | null>(
    () => (name === undefined ? null : { name, shortName, city, unitCount }),
    [name, shortName, city, unitCount],
  );

  return <LinkedFactsContext.Provider value={value}>{children}</LinkedFactsContext.Provider>;
}

/** The facts to resolve a section's linked fields with, or null when they are not known. */
export function useLinkedFacts(): LinkedFacts | null {
  return useContext(LinkedFactsContext);
}
