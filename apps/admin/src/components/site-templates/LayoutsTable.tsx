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
    essentials: 'bg-blue-100 text-blue-800',
    professional: 'bg-purple-100 text-purple-800',
    pm: 'bg-amber-100 text-amber-800',
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
      className="space-y-3 bg-gray-50 px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nameEmpty) onSave(draft);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-gray-600">
          Display name
          <input
            data-testid={`layout-edit-displayName-${row.slug}`}
            type="text"
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          Tier
          <select
            data-testid={`layout-edit-tier-${row.slug}`}
            value={draft.tier}
            onChange={(e) => setDraft({ ...draft, tier: e.target.value as LayoutRow['tier'] })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm capitalize text-gray-900"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
          Tagline
          <input
            data-testid={`layout-edit-tagline-${row.slug}`}
            type="text"
            value={draft.tagline ?? ''}
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
          Description
          <textarea
            data-testid={`layout-edit-description-${row.slug}`}
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
          <input
            data-testid={`layout-edit-featured-${row.slug}`}
            type="checkbox"
            checked={draft.isFeatured}
            onChange={(e) => setDraft({ ...draft, isFeatured: e.target.checked })}
          />
          Featured
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
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
            <span role="alert" className="text-xs text-rose-600">
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid={`layout-edit-save-${row.slug}`}
            disabled={saving || nameEmpty}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
        <p className="text-sm text-gray-500">No layouts configured.</p>
      </div>
    );
  }

  const editingRow = editingSlug ? rows.find((r) => r.slug === editingSlug) : undefined;

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Layout</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Slug</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Default Preset</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tier</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Version</th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((layout) => (
            <tr key={layout.id} data-testid={`layout-row-${layout.slug}`}>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  {layout.isFeatured && (
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Featured" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{layout.displayName}</span>
                </div>
                {layout.tagline && <p className="mt-0.5 text-xs italic text-gray-600">{layout.tagline}</p>}
                {layout.description && <p className="mt-1 max-w-md text-xs text-gray-500">{layout.description}</p>}
              </td>
              <td className="px-4 py-3 align-top">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{layout.slug}</code>
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-700">
                {layout.defaultPresetSlug ? (
                  <code className="rounded bg-gray-100 px-1.5 py-0.5">{layout.defaultPresetSlug}</code>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <TierBadge tier={layout.tier} />
              </td>
              <td className="px-4 py-3 align-top">
                {layout.isArchived ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    Archived
                  </span>
                ) : (
                  <span className="text-xs text-green-700">Active</span>
                )}
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-600">{layout.version}</td>
              <td className="px-4 py-3 align-top text-right">
                {savedSlug === layout.slug && editingSlug !== layout.slug && (
                  <span className="mr-2 text-xs text-green-700">Saved</span>
                )}
                <button
                  type="button"
                  data-testid={`layout-edit-${layout.slug}`}
                  onClick={() => {
                    setError(null);
                    setEditingSlug((cur) => (cur === layout.slug ? null : layout.slug));
                  }}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {editingSlug === layout.slug ? 'Close' : 'Edit'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingRow && (
        <div className="border-t border-gray-200">
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
