/**
 * The four looks' theme presets, as migration 0097 seeds them
 * (`packages/db/migrations/0097_site_looks_catalog.sql`, the `site_theme_presets`
 * rows' `tokens` jsonb), for tests that cannot read the database:
 *   - the layouts' contrast test checks every colour pair a look paints against
 *     these values;
 *   - the looks registry test string-compares them with the migration, so the two
 *     cannot drift apart.
 *
 * Each entry's keys are in the migration's order, so `JSON.stringify(tokens)` is
 * exactly the JSON literal the migration inserts.
 */
export type SiteLookPresetId = 'bayfront' | 'heritage' | 'palm-grove' | 'plain-simple';

export interface SiteLookPresetTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
}

export const SITE_LOOK_PRESETS: Readonly<Record<SiteLookPresetId, SiteLookPresetTokens>> = {
  bayfront: {
    primaryColor: '#0B4F5C',
    secondaryColor: '#F5EFE6',
    accentColor: '#E9A23B',
    headingFont: 'Playfair Display',
    bodyFont: 'Source Sans 3',
  },
  heritage: {
    primaryColor: '#1D2B4A',
    secondaryColor: '#FBF8F1',
    accentColor: '#7A5B27',
    headingFont: 'Libre Baskerville',
    bodyFont: 'Lato',
  },
  'palm-grove': {
    primaryColor: '#2D5E4A',
    secondaryColor: '#FBF6EA',
    accentColor: '#B4532A',
    headingFont: 'Lora',
    bodyFont: 'Nunito Sans',
  },
  'plain-simple': {
    primaryColor: '#1D4E89',
    secondaryColor: '#EEF3FA',
    accentColor: '#FFF4CC',
    headingFont: 'Figtree',
    bodyFont: 'Figtree',
  },
};
