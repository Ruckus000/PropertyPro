'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Which Contact details the Community profile does not have yet. A flag per
 * detail the Contact section can show; `true` means it is missing.
 */
export interface MissingContactDetails {
  address: boolean;
  officeHours: boolean;
  phone: boolean;
  email: boolean;
}

/** One group of the association's official records and how many are posted for owners. */
export interface OwnerRecordGroupCount {
  label: string;
  postedCount: number;
}

/**
 * What the section panels know about where a section's content comes from.
 *
 * - `layoutId`: the layout the canvas draws, for "Use the look's wording".
 * - `contact`: which Contact details are still missing, or null when unknown.
 * - `ownerRecordGroups`: the owners' records posted, or null when unknown.
 * - `recordsApply`: whether this kind of community has a records list at all.
 *   Apartments owe none, so the Documents panel says nothing about owner records.
 */
export interface SectionSources {
  layoutId: string | null;
  contact: MissingContactDetails | null;
  ownerRecordGroups: readonly OwnerRecordGroupCount[] | null;
  recordsApply: boolean;
}

/** Outside a provider nothing is known, and every panel stays renderable on its own. */
const UNKNOWN: SectionSources = {
  layoutId: null,
  contact: null,
  ownerRecordGroups: null,
  recordsApply: true,
};

const SectionSourcesContext = createContext<SectionSources>(UNKNOWN);

function isBlank(value: string | null | undefined): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/** The contact info the canvas draws, as the page's Contact section reads it. */
export interface ContactInfoLike {
  management: { email: string | null; phone: string | null } | null;
  address: string | null;
  officeHours: string | null;
}

/** Which of the Contact section's details the info lacks. */
export function missingContactDetails(info: ContactInfoLike): MissingContactDetails {
  return {
    address: isBlank(info.address),
    officeHours: isBlank(info.officeHours),
    phone: isBlank(info.management?.phone),
    email: isBlank(info.management?.email),
  };
}

/**
 * Hands the section panels the facts behind the canvas, so a panel can say where
 * its section's content comes from and what is missing without a request of its
 * own.
 *
 * A context rather than props for the reason `LinkedFactsProvider` is one: the
 * forms are code-split, several levels below `Inspector`, and rendered in two
 * presentations (the docked column and the overlay sheet).
 *
 * Memoised on the values, so a change elsewhere in the canvas context does not
 * re-render the open form.
 */
export function SectionSourcesProvider({
  layoutId,
  contact,
  ownerRecordGroups,
  recordsApply,
  children,
}: {
  layoutId: string | null;
  contact: ContactInfoLike | null;
  ownerRecordGroups: readonly OwnerRecordGroupCount[] | null;
  recordsApply: boolean;
  children: ReactNode;
}) {
  const missing = useMemo(
    () => (contact === null ? null : missingContactDetails(contact)),
    [contact],
  );
  const value = useMemo<SectionSources>(
    () => ({ layoutId, contact: missing, ownerRecordGroups, recordsApply }),
    [layoutId, missing, ownerRecordGroups, recordsApply],
  );
  return <SectionSourcesContext.Provider value={value}>{children}</SectionSourcesContext.Provider>;
}

export function useSectionSources(): SectionSources {
  return useContext(SectionSourcesContext);
}
