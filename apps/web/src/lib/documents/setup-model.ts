/**
 * The Documents setup model: what the empty-state guide shows, derived only
 * from data the page already has (spec docs/design-system/patterns/empty-states.md
 * rule 8, §4.2; plan D11, D12).
 *
 * - Condo / HOA: the community's statutory checklist rows, grouped into steps.
 *   Progress counts applicable, required records whose file is POSTED (a
 *   draft or deleted file does not count, matching the compliance status).
 * - Apartment: no statute. The community's own categories become a suggested
 *   starter set: the ones tenants can open first, then the rest. Nothing is
 *   called "required" and nothing is counted against a law.
 *
 * Pure: no React, no fetching. The page turns these into SetupGuide props.
 */

import {
  canAccessCategory,
  normalizeCategoryName,
  type CommunityType,
} from '@propertypro/shared';

/** The checklist fields this model reads (a subset of the compliance GET row). */
export interface SetupChecklistItem {
  id: number;
  templateKey: string;
  title: string;
  category: string;
  documentId?: number | null;
  documentState?: 'posted' | 'draft' | 'deleted' | null;
  isConditional?: boolean;
  isApplicable?: boolean;
}

export interface SetupCategory {
  id: number;
  name: string;
}

export type StatutoryStepKey = 'governing' | 'money' | 'meetings' | 'board' | 'building';

export interface StatutoryStep {
  key: StatutoryStepKey;
  label: string;
  heading: string;
  description: string;
  items: SetupChecklistItem[];
  /** Applicable, non-conditional items, and how many are posted. */
  required: number;
  posted: number;
  done: boolean;
}

const STEP_COPY: Record<StatutoryStepKey, { label: string; heading: string; description: string }> = {
  governing: {
    label: 'Governing',
    heading: 'Upload your governing documents',
    description: 'The ones owners ask for first. They are often already PDFs in a board member’s email.',
  },
  money: {
    label: 'Money',
    heading: 'Post the money records',
    description: 'The budget and the year-end financial report.',
  },
  meetings: {
    label: 'Meetings',
    heading: 'Post your meeting records',
    description: 'Each new set of minutes and each notice is posted as it happens.',
  },
  board: {
    label: 'Board, insurance & contracts',
    heading: 'Post the board, insurance and contract records',
    description: 'Board certifications, the insurance policies and the contracts list.',
  },
  building: {
    label: 'Building',
    heading: 'Post the building reports that apply',
    description: 'Inspection reports, the reserve study and permits, for the buildings that have them.',
  },
};

const STEP_ORDER: readonly StatutoryStepKey[] = ['governing', 'money', 'meetings', 'board', 'building'];

/** Records filed under meeting_records that are about the board, not meetings. */
const BOARD_RECORDS = new Set(['affidavits', 'director_certifications', 'conflict_of_interest']);

/** Which step a checklist record belongs to. `inspectionCategory` is the record's document category. */
export function statutoryStepFor(item: Pick<SetupChecklistItem, 'templateKey' | 'category'>, documentCategory: string): StatutoryStepKey {
  const key = item.templateKey.replace(/^\d+_/, '');
  if (BOARD_RECORDS.has(key)) return 'board';
  switch (item.category) {
    case 'governing_documents':
      return 'governing';
    case 'financial_records':
      return 'money';
    case 'meeting_records':
      return 'meetings';
    case 'operations':
      return documentCategory === 'Inspection Reports' ? 'building' : 'board';
    default:
      return 'board';
  }
}

export const isApplicable = (item: SetupChecklistItem) => item.isApplicable !== false;
// ponytail: a rolling-window record (minutes, notices) counts as posted while its
// file is posted, however old; Compliance owns currency. Trigger: a manager sees
// setup "complete" while Compliance shows those records overdue.
export const isPosted = (item: SetupChecklistItem) => item.documentId != null && item.documentState === 'posted';
/** A record whose linked file is a saved draft: post the draft, don't upload over it. */
export const hasDraft = (item: SetupChecklistItem) => item.documentId != null && item.documentState === 'draft';

/**
 * Statutory steps, in order, empty groups dropped (an HOA has no Building step).
 * `documentCategoryFor` resolves a record to its document category name
 * (`getTemplateDocumentCategory` in the app).
 */
export function buildStatutorySteps(
  items: SetupChecklistItem[],
  documentCategoryFor: (item: SetupChecklistItem) => string,
): StatutoryStep[] {
  const grouped = new Map<StatutoryStepKey, SetupChecklistItem[]>();
  for (const item of items) {
    const key = statutoryStepFor(item, documentCategoryFor(item));
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return STEP_ORDER.filter((key) => grouped.has(key)).map((key) => {
    const stepItems = grouped.get(key) ?? [];
    const requiredItems = stepItems.filter((i) => !i.isConditional && isApplicable(i));
    const posted = requiredItems.filter(isPosted).length;
    // A step of only "if it applies" records is done once none is left open:
    // each is posted or marked as not applying.
    const openConditional = stepItems.filter((i) => i.isConditional && isApplicable(i) && !isPosted(i));
    return {
      key,
      ...STEP_COPY[key],
      items: stepItems,
      required: requiredItems.length,
      posted,
      done: posted === requiredItems.length && (requiredItems.length > 0 || openConditional.length === 0),
    };
  });
}

export interface StatutoryProgress {
  /** Applicable required records posted / applicable required records. */
  posted: number;
  required: number;
  /** Conditional records still open (applicable, not posted). */
  conditionalOpen: number;
  /** The next required record to post, in step order. */
  next: SetupChecklistItem | null;
  complete: boolean;
}

export function statutoryProgress(steps: StatutoryStep[]): StatutoryProgress {
  const all = steps.flatMap((s) => s.items);
  const required = all.filter((i) => !i.isConditional && isApplicable(i));
  // A draft-linked record is "post it from the library", never "upload next":
  // an upload would link over the draft and orphan it.
  const next = required.find((i) => !isPosted(i) && !hasDraft(i)) ?? null;
  return {
    posted: required.filter(isPosted).length,
    required: required.length,
    conditionalOpen: all.filter((i) => i.isConditional && isApplicable(i) && !isPosted(i)).length,
    next,
    complete: next === null,
  };
}

export interface StarterSet {
  /** Categories tenants can open, read from the access policy. */
  residentFacing: SetupCategory[];
  /** Every other category: staff only. */
  staffOnly: SetupCategory[];
}

/** Apartment starter set: split the community's own categories by what a tenant may open. */
export function buildStarterSet(categories: SetupCategory[], communityType: CommunityType): StarterSet {
  const residentFacing: SetupCategory[] = [];
  const staffOnly: SetupCategory[] = [];
  for (const category of categories) {
    const tenantCanOpen = canAccessCategory('resident', communityType, normalizeCategoryName(category.name), {
      isUnitOwner: false,
    });
    (tenantCanOpen ? residentFacing : staffOnly).push(category);
  }
  return { residentFacing, staffOnly };
}
