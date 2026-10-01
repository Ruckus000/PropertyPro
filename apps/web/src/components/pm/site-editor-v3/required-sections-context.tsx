'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  countLiveSections,
  isRequiredSectionType,
  recommendedSectionTypes,
  requirementLevel,
  requiredSectionLaw,
  requiredSectionStatus,
  unitCountUnknown,
  unitThreshold,
  type ComplianceSubject,
  type RequiredSectionPage,
  type RequiredSectionStatus,
  type RequirementLevel,
} from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useUpdateCommunityUnitCount } from '@/hooks/use-community-unit-count';
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
  /**
   * Community type + unit count — what every rule here is asked about. The
   * count is the one this session last SAVED, so a correction in the pill
   * re-decides everything without a reload.
   */
  subject: ComplianceSubject;
  /** `required`, `recommended` (below the size threshold) or `none`. */
  level: RequirementLevel;
  /** True when `level` is `required` only because nobody has given the count. */
  unitCountUnknown: boolean;
  /** `{ minUnits: 25, unitNoun: 'units' }` for copy; null for apartments. */
  threshold: { minUnits: number; unitNoun: string } | null;
  /**
   * Below the threshold: badged "Recommended", and nothing else — never
   * locked, confirmed or warned about. Always false when `isRequired` is true.
   */
  isRecommended: (blockType: string) => boolean;
  /** Whether this viewer may change the count (community admin). */
  canEditUnitCount: boolean;
  /** Saves the count; rejects with the server's message on refusal. */
  saveUnitCount: (unitCount: number) => Promise<void>;
  isSavingUnitCount: boolean;
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
  subject: { communityType: '', unitCount: null },
  level: 'none',
  unitCountUnknown: false,
  threshold: null,
  isRecommended: () => false,
  canEditUnitCount: false,
  saveUnitCount: async () => {},
  isSavingUnitCount: false,
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
   * `communities.unit_count` as the page loaded it; `null` = unknown, which the
   * rules treat as covered (see `requirementLevel`).
   */
  unitCount: number | null;
  /** Community admin — the PATCH route enforces the same; this only offers it. */
  canEditUnitCount: boolean;
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
  unitCount: initialUnitCount,
  canEditUnitCount,
  pages,
  children,
}: RequiredSectionsProviderProps) {
  const upsert = useUpsertContentBlock(communityId);
  const updateUnitCount = useUpdateCommunityUnitCount(communityId);
  // The saved value for this session. Seeded from the server prop and replaced
  // by the server's answer after a save — never by what was typed.
  const [unitCount, setUnitCount] = useState(initialUnitCount);
  const { mutateAsync: patchUnitCount, isPending: isSavingUnitCount } = updateUnitCount;
  const saveUnitCount = useCallback(
    async (next: number) => {
      const saved = await patchUnitCount(next);
      setUnitCount(saved.unitCount);
    },
    [patchUnitCount],
  );

  const value = useMemo<RequiredSectionsValue>(() => {
    const subject: ComplianceSubject = { communityType, unitCount };
    const recommended = recommendedSectionTypes(subject) as readonly string[];
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
    const isRequired = (blockType: string) => isRequiredSectionType(subject, blockType);
    return {
      subject,
      level: requirementLevel(subject),
      unitCountUnknown: unitCountUnknown(subject),
      threshold: unitThreshold(communityType),
      isRecommended: (blockType) => recommended.includes(blockType),
      canEditUnitCount,
      saveUnitCount,
      isSavingUnitCount,
      statuses: pages === undefined ? [] : requiredSectionStatus(subject, pages),
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
  }, [communityType, unitCount, canEditUnitCount, saveUnitCount, isSavingUnitCount, pages, upsert]);

  return (
    <RequiredSectionsContext.Provider value={value}>{children}</RequiredSectionsContext.Provider>
  );
}

export function useRequiredSections(): RequiredSectionsValue {
  return useContext(RequiredSectionsContext);
}
