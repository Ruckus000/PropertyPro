/**
 * Theme preset catalog reader (PR #5b).
 *
 * AUTHZ: Platform-level read from site_theme_presets. The table is NOT
 * tenant-scoped (catalog data managed by platform admin), but this file
 * is allowlisted in scripts/verify-scoped-db-access.ts so the unscoped
 * client can be used here. Callers MUST verify pm_admin / cam
 * membership in the target community AND the `hasSiteEditor` plan
 * feature before invoking — the rows returned are not community-
 * sensitive but the wizard surface that consumes them is gated.
 */
import { cache } from 'react';
import { siteThemePresets } from '@propertypro/db';
// AUTHZ: Platform catalog read — community-agnostic; callers gate by membership at the route layer.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, asc, desc, eq } from '@propertypro/db/filters';

export interface ThemePresetForWizard {
  id: number;
  slug: string;
  displayName: string;
  description: string | null;
  tokens: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    headingFont?: string;
    bodyFont?: string;
  };
  tier: 'essentials' | 'professional' | 'pm';
  isFeatured: boolean;
}

/**
 * Returns the non-archived theme presets in display order (featured
 * first, then by display name). Wrapped in React.cache so multiple
 * server components on a single request share one DB read.
 */
export const listThemePresetsForWizard = cache(async (): Promise<ThemePresetForWizard[]> => {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: siteThemePresets.id,
      slug: siteThemePresets.slug,
      displayName: siteThemePresets.displayName,
      description: siteThemePresets.description,
      tokens: siteThemePresets.tokens,
      tier: siteThemePresets.tier,
      isFeatured: siteThemePresets.isFeatured,
    })
    .from(siteThemePresets)
    .where(and(eq(siteThemePresets.isArchived, false)))
    .orderBy(desc(siteThemePresets.isFeatured), asc(siteThemePresets.displayName));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    description: r.description,
    tokens: (r.tokens ?? {}) as ThemePresetForWizard['tokens'],
    tier: r.tier,
    isFeatured: r.isFeatured,
  }));
});
