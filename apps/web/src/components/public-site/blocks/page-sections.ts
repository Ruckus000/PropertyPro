/**
 * Which section a Quick links link lands on, and the id that section carries.
 *
 * The public site gives a data section an `id` of its block type (`#meetings`)
 * so a Quick links link can scroll to it. Only the FIRST section of each type on
 * a page gets one: a page can hold two Meetings sections, and an id must not
 * repeat. Quick links judges each link by that same first section, so a link
 * and the section it lands on cannot disagree.
 *
 * The layouts call this for the public site and the PM preview. The editor
 * canvas does not: it renders no anchors.
 *
 * Kept apart from `./view-registry`, which lists the same data types, because
 * that module is the editor's and code-splits views with `next/dynamic`; the
 * public layouts must not import it. `page-sections.test.ts` holds the two
 * lists together.
 */

/** The data section types: the first of each type on a page carries the type as its id. */
export const ANCHORED_SECTION_TYPES: ReadonlySet<string> = new Set([
  'announcements',
  'documents',
  'meetings',
  'contact',
  'quicklinks',
  'board',
]);

interface SectionRef {
  id: number;
  blockType: string;
}

/** The first section of `blockType` on the page, in page order: the one `#blockType` lands on. */
export function firstSectionOfType<T extends SectionRef>(
  sections: readonly T[],
  blockType: string,
): T | undefined {
  return sections.find((section) => section.blockType === blockType);
}

/**
 * The anchor id of each section that gets one, by section id: the block type,
 * for the first section of each data type. Every other section is absent.
 */
export function sectionAnchorIds(sections: readonly SectionRef[]): ReadonlyMap<number, string> {
  const anchors = new Map<number, string>();
  for (const blockType of ANCHORED_SECTION_TYPES) {
    const first = firstSectionOfType(sections, blockType);
    if (first) anchors.set(first.id, blockType);
  }
  return anchors;
}
