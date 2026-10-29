/**
 * How each of the four looks draws itself: its hero, the rhythm of the sections
 * under it, its corners, and where its accent colour goes.
 *
 * No colour is named here. Colours come from the community's theme through the
 * `--theme-*` custom properties, which a look's preset fills (migration 0097),
 * so a manager's own colours ride on the same layout. This table says which
 * colour goes where; `look-contrast.test.ts` checks every pair it implies
 * against the presets.
 *
 * Read by `HeroBlock` (the hero) and `SiteChrome` (the page around it). Pure
 * data and client-safe: the editor canvas renders both.
 *
 * A look id, its layout id and its preset slug are the same string (D2).
 */
import type { LayoutId } from '../blocks/types';

/**
 * - `photo-full`: the photo fills the hero, with the words over it on a scrim.
 * - `photo-split`: the words and the photo side by side.
 * - `photo-card`: a wide photo with the words on a card overlapping it.
 * - `text`: the words alone. Every look draws this when its hero has no photos.
 */
export type HeroStyle = 'photo-full' | 'photo-split' | 'photo-card' | 'text';

export interface LookStyle {
  heroStyle: HeroStyle;
  /** `alternate`: every other section on the theme's secondary colour; `none`: hairline rules between sections. */
  sectionTint: 'alternate' | 'none';
  /** The corners of the hero's button, photo and card. */
  radius: 'square' | 'rounded' | 'pill';
  /** How the layout paints the accent colour. */
  accentUse: 'text' | 'background';
  /** Text colour on an accent background: `inverse` (white) or `text` (the body text colour). */
  onAccent: 'inverse' | 'text';
}

/** The layouts that are looks. A type error here means a look is missing from `LAYOUT_IDS`. */
export type LookLayoutId = Extract<LayoutId, 'bayfront' | 'heritage' | 'palm-grove' | 'plain-simple'>;

export const LOOK_STYLES: Readonly<Record<LookLayoutId, LookStyle>> = {
  bayfront: {
    heroStyle: 'photo-full',
    sectionTint: 'alternate',
    radius: 'pill',
    accentUse: 'background',
    onAccent: 'text',
  },
  heritage: {
    heroStyle: 'photo-split',
    sectionTint: 'none',
    radius: 'square',
    accentUse: 'text',
    onAccent: 'inverse',
  },
  'palm-grove': {
    heroStyle: 'photo-card',
    sectionTint: 'alternate',
    radius: 'rounded',
    accentUse: 'background',
    onAccent: 'inverse',
  },
  'plain-simple': {
    heroStyle: 'text',
    sectionTint: 'none',
    radius: 'rounded',
    accentUse: 'background',
    onAccent: 'text',
  },
};

/** The look a layout draws, or null for a legacy layout (tidewater, boulevard, sable). */
export function lookStyleFor(layout: LayoutId): LookStyle | null {
  return layout in LOOK_STYLES ? LOOK_STYLES[layout as LookLayoutId] : null;
}
