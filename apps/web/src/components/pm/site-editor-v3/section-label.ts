/**
 * Human labels for block types, used by the section list, the float controls'
 * accessible names, and the reorder live-region announcements.
 *
 * Deliberately separate from `TOOL_PANEL_TITLES` — these name a *section on the
 * page*, not a tool panel, and the two vocabularies drift (the "Add" panel adds
 * a "Text section"; there is no "Add" section).
 */
const SECTION_LABELS: Record<string, string> = {
  hero: 'Welcome',
  text: 'Text',
  image: 'Image',
  documents: 'Documents',
  meetings: 'Meetings',
  announcements: 'Announcements',
  contact: 'Contact',
  faq: 'FAQ',
  gallery: 'Gallery',
  amenities: 'Amenities',
};

/**
 * Falls back to the raw type rather than "Unknown" so a block type this build
 * has no label for is still identifiable in a screen-reader announcement.
 */
export function sectionLabel(blockType: string): string {
  return SECTION_LABELS[blockType] ?? blockType;
}
