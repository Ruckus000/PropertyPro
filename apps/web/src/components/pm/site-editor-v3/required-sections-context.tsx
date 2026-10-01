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
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { upsertableBlockType } from '@/lib/site-editor/upsertable-block-type';

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
  /**
   * Un-hides the section at `target`, on WHATEVER page it is — the pill's
   * one-click fix. False when it cannot (the section is not in the snapshot,
   * or sits in the page-less `SITE_CHANGE_GROUP` bucket, which no write can
   * address); the caller then falls back to taking the PM there.
   */
  showSection: (target: { pageId: string; slot: number }) => boolean;
}

const NOTHING_REQUIRED: RequiredSectionsValue = {
  statuses: [],
  isRequired: () => false,
  canRemove: () => true,
  hideNeedsConfirm: () => false,
  lawFor: () => null,
  showSection: () => false,
};

const RequiredSectionsContext = createContext<RequiredSectionsValue>(NOTHING_REQUIRED);

export interface RequiredSectionsProviderProps {
  /** For `showSection`'s write, which is community-scoped like every block write. */
  communityId: number;
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
  communityId,
  communityType,
  pages,
  children,
}: RequiredSectionsProviderProps) {
  const upsert = useUpsertContentBlock(communityId);
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
      showSection: ({ pageId, slot }) => {
        const numericPageId = Number(pageId);
        const section = pages
          ?.find((p) => p.pageId === pageId)
          ?.snapshot.sections.find((s) => s.slot === slot);
        const blockType = section ? upsertableBlockType(section.blockType) : null;
        if (!section || blockType === null || !Number.isFinite(numericPageId)) return false;
        // The same write `toggleHidden` makes — `hidden` is `z.literal(true)`,
        // so visible means the key is ABSENT — but carrying an explicit page id.
        // `toggleHidden` cannot do this: it resolves the block from the
        // SELECTED page's list, and the write hooks default to that page, so a
        // copy on another page is out of its reach (D-WRITE).
        const content = { ...((section.content ?? {}) as Record<string, unknown>) };
        delete content.hidden;
        upsert.mutate({
          blockType,
          blockOrder: slot,
          content,
          pageId: numericPageId,
        });
        return true;
      },
    };
  }, [communityType, pages, upsert]);

  return (
    <RequiredSectionsContext.Provider value={value}>{children}</RequiredSectionsContext.Provider>
  );
}

export function useRequiredSections(): RequiredSectionsValue {
  return useContext(RequiredSectionsContext);
}
