'use client';

/**
 * Which site page the v3 editor is currently editing (Phase 11b-3).
 *
 * This exists so the three block-write hooks can target the right page WITHOUT
 * every call site having to thread a page id down. That matters more than it
 * sounds: `resolvePageId` on the server defaults an absent `pageId` to the
 * community's HOME page, so a write issued while the PM is editing page B and
 * carrying no page id does not fail — it silently rewrites the live home page.
 * Eight inspector forms call the upsert hook, and a design that required each
 * of them to remember a new argument would be one forgotten argument away from
 * that (D-WRITE).
 *
 * Two properties are load-bearing and must not be "tidied up":
 *
 *  1. **`useSelectedSitePage()` returns `null` outside a provider — it must not
 *     throw.** `onboarding-wizard/ConfirmPublish.tsx` calls `useContentBlocks`
 *     from outside the editor tree entirely; a throwing hook would crash the
 *     wizard's publish step. `null` means "no page selected", which the write
 *     hooks translate into the pre-11b-3 behaviour of omitting `pageId` and
 *     letting the server default to home.
 *
 *  2. **The value is the page id only.** Richer selected-page state (name, slug,
 *     draft flag) belongs to the Pages panel that owns it; keeping this context
 *     to a single number means a page switch re-renders the write hooks and
 *     nothing else.
 *
 * Caveat worth knowing: a provider that is present but still loading also
 * supplies `null`, which is indistinguishable here from "no provider". Both
 * mean "fall back to home", so the editor must not render block-editing
 * affordances before it knows which page is selected.
 */

import { createContext, useContext, type ReactNode } from 'react';

/**
 * `null` is the default context value on purpose — see (1) above. Consuming
 * this outside a provider is a supported, silent, well-defined case.
 */
const SelectedSitePageContext = createContext<number | null>(null);

export interface SelectedSitePageProviderProps {
  /** The site page currently being edited, or `null` while none is known. */
  pageId: number | null;
  children: ReactNode;
}

export function SelectedSitePageProvider({ pageId, children }: SelectedSitePageProviderProps) {
  return (
    <SelectedSitePageContext.Provider value={pageId}>{children}</SelectedSitePageContext.Provider>
  );
}

/**
 * The id of the site page currently being edited, or `null` when there is no
 * selection — including when called from outside any provider.
 */
export function useSelectedSitePage(): number | null {
  return useContext(SelectedSitePageContext);
}
