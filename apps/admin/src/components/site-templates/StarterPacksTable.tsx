'use client';

/**
 * Starter Packs catalog table with inline edit + new-version + archive.
 * Mirrors ThemePresetsTable (plain fetch + useState; no react-query). Calls the
 * /api/admin/site-templates/starter-packs routes.
 */
import { useMemo, useState } from 'react';
import { StarterPackBlocksEditor, type EditorBlock } from './StarterPackBlocksEditor';

export interface StarterPackRow {
  id: number; slug: string; displayName: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  description: string | null; blocks: EditorBlock[]; version: number;
  isArchived: boolean; createdAt: string; updatedAt: string;
}

const API = '/api/admin/site-templates/starter-packs';

async function readError(res: Response): Promise<string> {
  try { const b = await res.json() as { error?: { message?: string } }; return b.error?.message ?? `Request failed (${res.status})`; }
  catch { return `Request failed (${res.status})`; }
}

export function StarterPacksTable({ packs: initial }: { packs: StarterPackRow[] }) {
  const [rows, setRows] = useState<StarterPackRow[]>(initial);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<EditorBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const visible = useMemo(
    () => rows.filter((r) => typeFilter === 'all' || r.communityType === typeFilter),
    [rows, typeFilter],
  );

  async function refresh() {
    const res = await fetch(API);
    if (res.ok) {
      const b = await res.json() as { packs: StarterPackRow[] };
      setRows(b.packs);
    } else {
      setError('Saved, but the list could not be refreshed — reload the page to see the latest.');
    }
  }

  function startEdit(row: StarterPackRow) { setEditingId(row.id); setDraftBlocks(row.blocks ?? []); setError(null); }

  async function saveEdit(slug: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/${slug}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blocks: draftBlocks }) });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function saveNewVersion(slug: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/${slug}/new-version`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blocks: draftBlocks }) });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function setArchived(slug: string, archived: boolean) {
    setBusy(true); setError(null);
    try {
      const res = archived
        ? await fetch(`${API}/${slug}`, { method: 'DELETE' })
        : await fetch(`${API}/${slug}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isArchived: false }) });
      if (!res.ok) throw new Error(await readError(res));
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); }
  }

  return (
    <div>
      {error && <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <label className="mb-3 block text-sm text-gray-600">Filter by type
        <select data-testid="type-filter" className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All</option><option value="condo_718">condo_718</option><option value="hoa_720">hoa_720</option><option value="apartment">apartment</option>
        </select>
      </label>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Name</th><th>Slug</th><th>Type</th><th>Version</th><th>Blocks</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 align-top" data-testid={`pack-row-${row.slug}`}>
              <td className="py-2">{row.displayName}</td>
              <td className="font-mono text-xs">{row.slug}</td>
              <td>{row.communityType}</td>
              <td>{row.version}</td>
              <td>{(row.blocks ?? []).length}</td>
              <td>{row.isArchived ? <span className="text-gray-400">Archived</span> : <span className="text-green-700">Active</span>}</td>
              <td>
                {editingId === row.id ? (
                  <div className="space-y-2" data-testid={`pack-edit-${row.slug}`}>
                    <StarterPackBlocksEditor value={draftBlocks} onChange={setDraftBlocks} />
                    <div className="flex gap-2">
                      <button type="button" data-testid={`pack-save-${row.slug}`} disabled={busy} className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={() => saveEdit(row.slug)}>Save</button>
                      <button type="button" data-testid={`pack-newversion-${row.slug}`} disabled={busy} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => saveNewVersion(row.slug)}>Save as new version</button>
                      <button type="button" disabled={busy} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" data-testid={`pack-editbtn-${row.slug}`} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => startEdit(row)}>Edit</button>
                    <button type="button" data-testid={`pack-archive-${row.slug}`} disabled={busy} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => setArchived(row.slug, !row.isArchived)}>{row.isArchived ? 'Unarchive' : 'Archive'}</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
