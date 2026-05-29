/**
 * Client helper for the theme-preset metadata PATCH (spec §5.2).
 *
 * PATCH /api/admin/site-templates/theme-presets/[slug] with the changed
 * fields. Returns the shaped preset row on success; throws the server's error
 * message otherwise. Plain async fn (admin has no react-query) so the network
 * contract is unit-testable in isolation.
 *
 * NOTE: when `tokens` is included the server bumps the preset version — the
 * full 5-field tokens object must be supplied (the route's tokensSchema
 * requires every field).
 */
import type { ThemePresetRow } from '@/components/site-templates/ThemePresetsTable';

export interface PresetTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
}

export interface ThemePresetPatch {
  displayName?: string;
  description?: string | null;
  tier?: 'essentials' | 'professional' | 'pm';
  isFeatured?: boolean;
  isArchived?: boolean;
  tokens?: PresetTokens;
}

export async function saveThemePreset(
  slug: string,
  patch: ThemePresetPatch,
): Promise<ThemePresetRow> {
  const res = await fetch(`/api/admin/site-templates/theme-presets/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Request failed (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { preset: ThemePresetRow };
  return body.preset;
}
