/**
 * Human labels for block types, used by the float controls' and "Add a part"
 * buttons' accessible names, and the reorder live-region announcements.
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
  payments: 'Payments',
  quicklinks: 'Quick links',
  board: 'Board members',
};

/**
 * Falls back to the raw type rather than "Unknown" so a block type this build
 * has no label for is still identifiable in a screen-reader announcement.
 */
export function sectionLabel(blockType: string): string {
  return SECTION_LABELS[blockType] ?? blockType;
}
