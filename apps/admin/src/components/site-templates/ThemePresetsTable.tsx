'use client';

/**
 * Theme Presets table with inline editing (spec §5.2 / PR #6).
 *
 * Lists platform theme presets and lets a platform admin edit metadata
 * (display name, description, tier, featured, archived) and the token bundle
 * (3 colors + 2 fonts) via PATCH /api/admin/site-templates/theme-presets/[slug].
 * Editing tokens bumps the preset version server-side; metadata-only edits do
 * not. The slug is immutable (communities reference it via branding).
 */
import { useState } from 'react';
import { Star, Archive } from 'lucide-react';
import { saveThemePreset, type ThemePresetPatch, type PresetTokens } from '@/lib/site-templates/update-preset';

export interface ThemePresetRow {
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
  isArchived: boolean;
  isFeatured: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  presets: ThemePresetRow[];
}

const TIERS: ThemePresetRow['tier'][] = ['essentials', 'professional', 'pm'];

function TierBadge({ tier }: { tier: ThemePresetRow['tier'] }) {
  const palette: Record<ThemePresetRow['tier'], string> = {
    essentials: 'bg-status-info-subtle text-status-info',
    professional: 'bg-purple-100 text-purple-800', // design-tokens:exempt — categorical PLAN chip, not a status; design.md keeps plan chips on their own scale
    pm: 'bg-status-warning-subtle text-status-warning',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${palette[tier]}`}>
      {tier}
    </span>
  );
}

function Swatch({ color, label }: { color?: string; label: string }) {
  if (!color) return null;
  return (
    <span
      aria-label={`${label} ${color}`}
      title={`${label}: ${color}`}
      className="inline-block h-4 w-4 rounded border border-edge"
      style={{ backgroundColor: color }}
    />
  );
}

function tokensFrom(row: ThemePresetRow): PresetTokens {
  return {
    primaryColor: row.tokens?.primaryColor ?? '',
    secondaryColor: row.tokens?.secondaryColor ?? '',
    accentColor: row.tokens?.accentColor ?? '',
    headingFont: row.tokens?.headingFont ?? '',
    bodyFont: row.tokens?.bodyFont ?? '',
  };
}

/**
 * Build a patch of changed fields. Tokens are all-or-nothing: if any of the 5
 * token fields changed, send the full bundle (the route's tokensSchema requires
 * every field, and a token change bumps the version). Exported for testing.
 */
export function diffPreset(original: ThemePresetRow, draft: DraftPreset): ThemePresetPatch {
  const patch: ThemePresetPatch = {};
  const normalize = (v: string) => (v.trim() === '' ? null : v.trim());
  if (draft.displayName.trim() !== original.displayName) patch.displayName = draft.displayName.trim();
  if (normalize(draft.description) !== original.description) patch.description = normalize(draft.description);
  if (draft.tier !== original.tier) patch.tier = draft.tier;
  if (draft.isFeatured !== original.isFeatured) patch.isFeatured = draft.isFeatured;
  if (draft.isArchived !== original.isArchived) patch.isArchived = draft.isArchived;

  const orig = tokensFrom(original);
  const tokenChanged = (Object.keys(draft.tokens) as (keyof PresetTokens)[]).some(
    (k) => draft.tokens[k].trim() !== orig[k],
  );
  if (tokenChanged) {
    patch.tokens = {
      primaryColor: draft.tokens.primaryColor.trim(),
      secondaryColor: draft.tokens.secondaryColor.trim(),
      accentColor: draft.tokens.accentColor.trim(),
      headingFont: draft.tokens.headingFont.trim(),
      bodyFont: draft.tokens.bodyFont.trim(),
    };
  }
  return patch;
}

export interface DraftPreset {
  displayName: string;
  description: string;
  tier: ThemePresetRow['tier'];
  isFeatured: boolean;
  isArchived: boolean;
  tokens: PresetTokens;
}

/** Build the editable draft from a row. Exported for testing. */
export function draftFrom(row: ThemePresetRow): DraftPreset {
  return {
    displayName: row.displayName,
    description: row.description ?? '',
    tier: row.tier,
    isFeatured: row.isFeatured,
    isArchived: row.isArchived,
    tokens: tokensFrom(row),
  };
}

const TOKEN_FIELDS: { key: keyof PresetTokens; label: string; kind: 'color' | 'font' }[] = [
  { key: 'primaryColor', label: 'Primary', kind: 'color' },
  { key: 'secondaryColor', label: 'Secondary', kind: 'color' },
  { key: 'accentColor', label: 'Accent', kind: 'color' },
  { key: 'headingFont', label: 'Heading font', kind: 'font' },
  { key: 'bodyFont', label: 'Body font', kind: 'font' },
];

function PresetEditForm({
  row,
  saving,
  error,
  onSave,
  onCancel,
}: {
  row: ThemePresetRow;
  saving: boolean;
  error: string | null;
  onSave: (draft: DraftPreset) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<DraftPreset>(draftFrom(row));
  const nameEmpty = draft.displayName.trim().length === 0;

  return (
    <form
      data-testid={`preset-edit-form-${row.slug}`}
      className="space-y-3 bg-surface-page px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nameEmpty) onSave(draft);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-content-secondary">
          Display name
          <input
            data-testid={`preset-edit-displayName-${row.slug}`}
            type="text"
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            className="mt-1 block w-full rounded-md border border-edge-strong px-2 py-1 text-sm text-content"
          />
        </label>
        <label className="block text-xs font-medium text-content-secondary">
          Tier
          <select
            data-testid={`preset-edit-tier-${row.slug}`}
            value={draft.tier}
            onChange={(e) => setDraft({ ...draft, tier: e.target.value as ThemePresetRow['tier'] })}
            className="mt-1 block w-full rounded-md border border-edge-strong px-2 py-1 text-sm capitalize text-content"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-content-secondary sm:col-span-2">
          Description
          <textarea
            data-testid={`preset-edit-description-${row.slug}`}
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="mt-1 block w-full rounded-md border border-edge-strong px-2 py-1 text-sm text-content"
          />
        </label>
      </div>

      <fieldset className="rounded-md border border-edge p-3">
        <legend className="px-1 text-xs font-medium text-content-secondary">
          Tokens <span className="text-content-disabled">(editing bumps the version)</span>
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TOKEN_FIELDS.map((f) => (
            <label key={f.key} className="block text-xs font-medium text-content-secondary">
              {f.label}
              <div className="mt-1 flex items-center gap-2">
                {f.kind === 'color' && (
                  <Swatch color={draft.tokens[f.key] || undefined} label={f.label} />
                )}
                <input
                  data-testid={`preset-edit-${f.key}-${row.slug}`}
                  type="text"
                  value={draft.tokens[f.key]}
                  onChange={(e) =>
                    setDraft({ ...draft, tokens: { ...draft.tokens, [f.key]: e.target.value } })
                  }
                  className="block w-full rounded-md border border-edge-strong px-2 py-1 text-sm text-content"
                />
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
          <input
            data-testid={`preset-edit-featured-${row.slug}`}
            type="checkbox"
            checked={draft.isFeatured}
            onChange={(e) => setDraft({ ...draft, isFeatured: e.target.checked })}
          />
          Featured
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
          <input
            data-testid={`preset-edit-archived-${row.slug}`}
            type="checkbox"
            checked={draft.isArchived}
            onChange={(e) => setDraft({ ...draft, isArchived: e.target.checked })}
          />
          Archived
        </label>
        <div className="ml-auto flex items-center gap-2">
          {error && (
            <span role="alert" className="text-xs text-status-danger">
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-edge-strong bg-surface-card px-3 py-1 text-xs font-medium text-content-secondary hover:bg-surface-page disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid={`preset-edit-save-${row.slug}`}
            disabled={saving || nameEmpty}
            className="rounded-md bg-coral-600 px-3 py-1 text-xs font-medium text-white hover:bg-coral-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save preset'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ThemePresetsTable({ presets }: Props) {
  const [rows, setRows] = useState<ThemePresetRow[]>(presets);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  async function handleSave(slug: string, draft: DraftPreset) {
    const original = rows.find((r) => r.slug === slug);
    if (!original) return;
    const patch = diffPreset(original, draft);
    if (Object.keys(patch).length === 0) {
      setEditingSlug(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await saveThemePreset(slug, patch);
      setRows((rs) => rs.map((r) => (r.slug === slug ? updated : r)));
      setEditingSlug(null);
      setSavedSlug(slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-edge-strong bg-surface-page px-6 py-12 text-center">
        <p className="text-sm text-content-tertiary">No theme presets configured.</p>
      </div>
    );
  }

  const editingRow = editingSlug ? rows.find((r) => r.slug === editingSlug) : undefined;

  return (
    <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
      <table className="min-w-full divide-y divide-edge">
        <thead className="bg-surface-page">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Preset</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Slug</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Tokens</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Tier</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Status</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">v</th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-content-tertiary">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {rows.map((preset) => (
            <tr key={preset.id} data-testid={`theme-preset-row-${preset.slug}`}>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  {preset.isFeatured && (
                    <Star
                      className="h-3.5 w-3.5 fill-amber-400 text-amber-400" // design-tokens:exempt — featured-star gold; status-premium is gold-800, a dark bronze that reads as a DISABLED star
                      aria-label="Featured"
                    />
                  )}
                  <span className="text-sm font-medium text-content">{preset.displayName}</span>
                </div>
                {preset.description && <p className="mt-1 max-w-md text-xs text-content-tertiary">{preset.description}</p>}
              </td>
              <td className="px-4 py-3 align-top">
                <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-content-secondary">{preset.slug}</code>
              </td>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-1.5">
                  <Swatch color={preset.tokens?.primaryColor} label="Primary" />
                  <Swatch color={preset.tokens?.secondaryColor} label="Secondary" />
                  <Swatch color={preset.tokens?.accentColor} label="Accent" />
                </div>
                {(preset.tokens?.headingFont || preset.tokens?.bodyFont) && (
                  <p className="mt-1 text-xs text-content-tertiary">
                    {preset.tokens?.headingFont}
                    {preset.tokens?.headingFont && preset.tokens?.bodyFont ? ' / ' : ''}
                    {preset.tokens?.bodyFont}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <TierBadge tier={preset.tier} />
              </td>
              <td className="px-4 py-3 align-top">
                {preset.isArchived ? (
                  <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    Archived
                  </span>
                ) : (
                  <span className="text-xs text-status-success">Active</span>
                )}
              </td>
              <td className="px-4 py-3 align-top text-xs text-content-secondary">{preset.version}</td>
              <td className="px-4 py-3 align-top text-right">
                {savedSlug === preset.slug && editingSlug !== preset.slug && (
                  <span className="mr-2 text-xs text-status-success">Saved</span>
                )}
                <button
                  type="button"
                  data-testid={`preset-edit-${preset.slug}`}
                  onClick={() => {
                    setError(null);
                    setEditingSlug((cur) => (cur === preset.slug ? null : preset.slug));
                  }}
                  className="rounded-md border border-edge-strong bg-surface-card px-2.5 py-1 text-xs font-medium text-content-secondary hover:bg-surface-page"
                >
                  {editingSlug === preset.slug ? 'Close' : 'Edit'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingRow && (
        <div className="border-t border-edge">
          <PresetEditForm
            key={editingRow.slug}
            row={editingRow}
            saving={saving}
            error={error}
            onSave={(draft) => void handleSave(editingRow.slug, draft)}
            onCancel={() => {
              setError(null);
              setEditingSlug(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
