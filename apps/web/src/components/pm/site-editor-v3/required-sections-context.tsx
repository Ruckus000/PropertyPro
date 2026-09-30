'use client';

import { createContext, useContext, useMemo } from 'react';
import {
  countLiveSections,
  isRequiredSectionType,
  requiredSectionLaw,
  requiredSectionStatus,
  type RequiredSectionPage,
  type RequiredSectionStatus,
} from '@propertypro/shared';

/**
 * Florida-required sections, as the editor's controls need to see them
 * (v4 builder, Phase 2).
 *
 * A context of its own rather than more fields on `SiteEditorProvider`, for
 * two reasons. That provider is page-scoped and remounts on every page switch,
 * while "is this the site's last Meetings section" is a WHOLE-SITE question —
 * it has to be answered from `useSiteDiff`'s per-page snapshots, which only
 * `EditorRoot` holds. And the default below (nothing required) keeps every
 * existing canvas and panel test, none of which mount this provider, exactly
 * as it was.
 *
 * The rules themselves live in `@propertypro/shared` (`required.ts`), which the
 * publish sheet and the server's delete guard also use.
 */
export interface RequiredSectionsValue {
  /** One entry per required type; `[]` for apartments and while loading. */
  statuses: readonly RequiredSectionStatus[];
  isRequired: (blockType: string) => boolean;
  /**
   * False for the site's last live copy of a required type. Hidden copies
   * count: the server guard (`assertRequiredSectionsSurvive`) refuses the same
   * removal, so this only saves the PM a round trip to that refusal.
   */
  canRemove: (blockType: string) => boolean;
  /**
   * True when hiding one more copy would leave visitors with none — the
   * moment the design asks the PM to confirm.
   */
  hideNeedsConfirm: (blockType: string) => boolean;
  /** The "Florida law … asks associations to post …" sentence; null if not required. */
  lawFor: (blockType: string) => string | null;
}

const NOTHING_REQUIRED: RequiredSectionsValue = {
  statuses: [],
  isRequired: () => false,
  canRemove: () => true,
  hideNeedsConfirm: () => false,
  lawFor: () => null,
};

const RequiredSectionsContext = createContext<RequiredSectionsValue>(NOTHING_REQUIRED);

export interface RequiredSectionsProviderProps {
  communityType: string;
  /**
   * Every page's draft-wins snapshot — `useSiteDiff().validated`. Undefined
   * while that is loading or has failed: then no status is reported (a pill
   * saying "missing" about a site that has not loaded yet would be false), and
   * the controls stay LOCKED, because an unknown count may be the last copy.
   * The server is the backstop either way.
   */
  pages: readonly RequiredSectionPage[] | undefined;
  children: React.ReactNode;
}

function isVisibleCopy(content: unknown): boolean {
  return (content as Record<string, unknown> | null)?.['hidden'] !== true;
}

export function RequiredSectionsProvider({
  communityType,
  pages,
  children,
}: RequiredSectionsProviderProps) {
  const value = useMemo<RequiredSectionsValue>(() => {
    const visibleCount = (blockType: string) =>
      pages === undefined
        ? 0
        : countLiveSections(
            pages.map((p) => ({
              ...p,
              snapshot: {
                ...p.snapshot,
                sections: p.snapshot.sections.filter((s) => isVisibleCopy(s.content)),
              },
            })),
            blockType,
          );
    const isRequired = (blockType: string) => isRequiredSectionType(communityType, blockType);
    return {
      statuses: pages === undefined ? [] : requiredSectionStatus(communityType, pages),
      isRequired,
      canRemove: (blockType) =>
        !isRequired(blockType) || (pages !== undefined && countLiveSections(pages, blockType) > 1),
      hideNeedsConfirm: (blockType) => isRequired(blockType) && visibleCount(blockType) <= 1,
      lawFor: (blockType) => requiredSectionLaw(communityType, blockType),
    };
  }, [communityType, pages]);

  return (
    <RequiredSectionsContext.Provider value={value}>{children}</RequiredSectionsContext.Provider>
  );
}

export function useRequiredSections(): RequiredSectionsValue {
  return useContext(RequiredSectionsContext);
}
