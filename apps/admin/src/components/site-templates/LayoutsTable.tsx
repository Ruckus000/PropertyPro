'use client';

/**
 * Layouts catalog table with inline metadata editing (spec §5.1 / PR #7).
 *
 * Renders the code-shipped layouts (Tidewater / Boulevard / Sable) and lets a
 * platform admin edit the public-facing metadata — display name, tagline,
 * description, tier, featured + archived flags — via the
 * PATCH /api/admin/site-templates/layouts/[slug] endpoint. The layout React
 * components themselves ship via PR; only catalog metadata is editable here.
 */
import { useState } from 'react';
import { Star, Archive } from 'lucide-react';
import { saveLayoutMetadata, type LayoutMetadataPatch } from '@/lib/site-templates/update-layout';

export interface LayoutRow {
  id: number;
  slug: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  tier: 'essentials' | 'professional' | 'pm';
  isArchived: boolean;
  isFeatured: boolean;
  defaultPresetSlug: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  layouts: LayoutRow[];
}

const TIERS: LayoutRow['tier'][] = ['essentials', 'professional', 'pm'];

function TierBadge({ tier }: { tier: LayoutRow['tier'] }) {
  const palette: Record<LayoutRow['tier'], string> = {
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

/** Build a patch of only the fields that changed (tagline/description '' → null). Exported for testing. */
export function diffLayout(original: LayoutRow, draft: LayoutRow): LayoutMetadataPatch {
  const patch: LayoutMetadataPatch = {};
  const normalize = (v: string) => (v.trim() === '' ? null : v.trim());
  if (draft.displayName.trim() !== original.displayName) patch.displayName = draft.displayName.trim();
  if (normalize(draft.tagline ?? '') !== original.tagline) patch.tagline = normalize(draft.tagline ?? '');
  if (normalize(draft.description ?? '') !== original.description) patch.description = normalize(draft.description ?? '');
  if (draft.tier !== original.tier) patch.tier = draft.tier;
  if (draft.isFeatured !== original.isFeatured) patch.isFeatured = draft.isFeatured;
  if (draft.isArchived !== original.isArchived) patch.isArchived = draft.isArchived;
  return patch;
}

function LayoutEditForm({
  row,
  saving,
  error,
  onSave,
  onCancel,
}: {
  row: LayoutRow;
  saving: boolean;
  error: string | null;
  onSave: (draft: LayoutRow) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<LayoutRow>(row);
  const nameEmpty = draft.displayName.trim().length === 0;

  return (
    <form
      data-testid={`layout-edit-form-${row.slug}`}
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
            data-testid={`layout-edit-displayName-${row.slug}`}
            type="text"
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            className="mt-1 block w-full rounded-md border border-edge-strong px-2 py-1 text-sm text-content"
          />
        </label>
        <label className="block text-xs font-medium text-content-secondary">
          Tier
          <select
            data-testid={`layout-edit-tier-${row.slug}`}
            value={draft.tier}
            onChange={(e) => setDraft({ ...draft, tier: e.target.value as LayoutRow['tier'] })}
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
          Tagline
          <input
            data-testid={`layout-edit-tagline-${row.slug}`}
            type="text"
            value={draft.tagline ?? ''}
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            className="mt-1 block w-full rounded-md border border-edge-strong px-2 py-1 text-sm text-content"
          />
        </label>
        <label className="block text-xs font-medium text-content-secondary sm:col-span-2">
          Description
          <textarea
            data-testid={`layout-edit-description-${row.slug}`}
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="mt-1 block w-full rounded-md border border-edge-strong px-2 py-1 text-sm text-content"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
          <input
            data-testid={`layout-edit-featured-${row.slug}`}
            type="checkbox"
            checked={draft.isFeatured}
            onChange={(e) => setDraft({ ...draft, isFeatured: e.target.checked })}
          />
          Featured
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
          <input
            data-testid={`layout-edit-archived-${row.slug}`}
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
            data-testid={`layout-edit-save-${row.slug}`}
            disabled={saving || nameEmpty}
            className="rounded-md bg-coral-600 px-3 py-1 text-xs font-medium text-white hover:bg-coral-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save metadata'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function LayoutsTable({ layouts }: Props) {
  const [rows, setRows] = useState<LayoutRow[]>(layouts);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  async function handleSave(slug: string, draft: LayoutRow) {
    const original = rows.find((r) => r.slug === slug);
    if (!original) return;
    const patch = diffLayout(original, draft);
    // No changes → just close (the endpoint would 400 on an empty patch).
    if (Object.keys(patch).length === 0) {
      setEditingSlug(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await saveLayoutMetadata(slug, patch);
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
        <p className="text-sm text-content-tertiary">No layouts configured.</p>
      </div>
    );
  }

  const editingRow = editingSlug ? rows.find((r) => r.slug === editingSlug) : undefined;

  return (
    <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
      <table className="min-w-full divide-y divide-edge">
        <thead className="bg-surface-page">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Layout</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Slug</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Default Preset</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Tier</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Status</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Version</th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-content-tertiary">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {rows.map((layout) => (
            <tr key={layout.id} data-testid={`layout-row-${layout.slug}`}>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  {layout.isFeatured && (
                    <Star
                      className="h-3.5 w-3.5 fill-amber-400 text-amber-400" // design-tokens:exempt — featured-star gold; status-premium is gold-800, a dark bronze that reads as a DISABLED star
                      aria-label="Featured"
                    />
                  )}
                  <span className="text-sm font-medium text-content">{layout.displayName}</span>
                </div>
                {layout.tagline && <p className="mt-0.5 text-xs italic text-content-secondary">{layout.tagline}</p>}
                {layout.description && <p className="mt-1 max-w-md text-xs text-content-tertiary">{layout.description}</p>}
              </td>
              <td className="px-4 py-3 align-top">
                <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-content-secondary">{layout.slug}</code>
              </td>
              <td className="px-4 py-3 align-top text-xs text-content-secondary">
                {layout.defaultPresetSlug ? (
                  <code className="rounded bg-surface-muted px-1.5 py-0.5">{layout.defaultPresetSlug}</code>
                ) : (
                  <span className="text-content-disabled">—</span>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <TierBadge tier={layout.tier} />
              </td>
              <td className="px-4 py-3 align-top">
                {layout.isArchived ? (
                  <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    Archived
                  </span>
                ) : (
                  <span className="text-xs text-status-success">Active</span>
                )}
              </td>
              <td className="px-4 py-3 align-top text-xs text-content-secondary">{layout.version}</td>
              <td className="px-4 py-3 align-top text-right">
                {savedSlug === layout.slug && editingSlug !== layout.slug && (
                  <span className="mr-2 text-xs text-status-success">Saved</span>
                )}
                <button
                  type="button"
                  data-testid={`layout-edit-${layout.slug}`}
                  onClick={() => {
                    setError(null);
                    setEditingSlug((cur) => (cur === layout.slug ? null : layout.slug));
                  }}
                  className="rounded-md border border-edge-strong bg-surface-card px-2.5 py-1 text-xs font-medium text-content-secondary hover:bg-surface-page"
                >
                  {editingSlug === layout.slug ? 'Close' : 'Edit'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingRow && (
        <div className="border-t border-edge">
          <LayoutEditForm
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
