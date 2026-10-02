/**
 * The Design panel's six templates (website builder v4, Phase 4b).
 *
 * The design's templates each bundled a layout, a colour set AND a page set.
 * The product has three layouts and a catalog of colour sets (`site_theme_presets`),
 * and no page sets — the design never decided pages for the HOA and apartment
 * templates either. So a template here is a named (layout, colour set) pair;
 * choosing one changes the look and nothing else. "Use the template's pages
 * too" waits for page sets (see the v4 plan's Phase 4 deferrals).
 *
 * Names and descriptions are the design's. Layouts are the real three: the
 * design's "Harbor" does not exist, so "Waterfront condo" uses Tidewater with
 * a warmer set. Each colour set is a catalog slug; a template whose set has
 * been archived is hidden rather than offered broken.
 */
import type { CommunityType } from '@propertypro/shared';

export interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  /** One of the public site's `LAYOUT_IDS`. */
  layoutId: 'tidewater' | 'boulevard' | 'sable';
  /** A `site_theme_presets.slug`. */
  presetSlug: string;
  /** The community type it is written for — shown first to that type. */
  forType: CommunityType;
}

export const DESIGN_TEMPLATES: readonly DesignTemplate[] = [
  {
    id: 'condo-essentials',
    name: 'Condo essentials',
    description:
      'What owners look for first: the next meeting, announcements and official records grouped by statutory category.',
    layoutId: 'tidewater',
    presetSlug: 'bay-light',
    forType: 'condo_718',
  },
  {
    id: 'waterfront-condo',
    name: 'Waterfront condo',
    description: 'Photo-led welcome and amenities, with meetings and documents below.',
    layoutId: 'tidewater',
    presetSlug: 'gulf-warm',
    forType: 'condo_718',
  },
  {
    id: 'neighborhood-hoa',
    name: 'Neighborhood HOA',
    description:
      'News, meetings, documents, assessment payments and answers to common questions.',
    layoutId: 'boulevard',
    presetSlug: 'palm-shadow',
    forType: 'hoa_720',
  },
  {
    id: 'established-hoa',
    name: 'Established HOA',
    description: 'A short, formal site: about, meetings, documents and contact.',
    layoutId: 'boulevard',
    presetSlug: 'midnight-coast',
    forType: 'hoa_720',
  },
  {
    id: 'apartment-community',
    name: 'Apartment community',
    description: 'For prospective residents: photos, amenities and FAQs.',
    layoutId: 'sable',
    presetSlug: 'linen-bronze',
    forType: 'apartment',
  },
  {
    id: 'resident-hub',
    name: 'Resident hub',
    description:
      'For current residents: announcements, rent payments and answers to common questions.',
    layoutId: 'sable',
    presetSlug: 'noir-coastal',
    forType: 'apartment',
  },
];

export const LAYOUT_NAMES: Record<DesignTemplate['layoutId'], string> = {
  tidewater: 'Tidewater',
  boulevard: 'Boulevard',
  sable: 'Sable',
};
