'use client';

/**
 * Edits a starter pack's blocks array. Compact fields for the six simple block
 * types (hero, text, announcements, documents, meetings, contact); a validated
 * JSON textarea for image/gallery/faq/amenities (see spec §8). Server-side
 * validateStarterPackBlocks is authoritative regardless of input path.
 */
import { useState } from 'react';
import { DOCUMENT_CATEGORIES } from '@propertypro/shared';

export interface EditorBlock { blockType: string; blockOrder: number; content: Record<string, unknown>; }

const BLOCK_TYPES = ['hero', 'text', 'announcements', 'documents', 'meetings', 'contact', 'image', 'gallery', 'faq', 'amenities'] as const;
const JSON_TYPES = new Set(['image', 'gallery', 'faq', 'amenities']);

interface Props {
  value: EditorBlock[];
  onChange: (next: EditorBlock[]) => void;
}

export function StarterPackBlocksEditor({ value, onChange }: Props) {
  const setBlock = (i: number, patch: Partial<EditorBlock>) =>
    onChange(value.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const a = value[i];
    const b = value[j];
    if (!a || !b) return;
    const next = [...value];
    next[i] = { ...b, blockOrder: a.blockOrder };
    next[j] = { ...a, blockOrder: b.blockOrder };
    onChange(next);
  };
  const add = () => {
    const nextOrder = value.length === 0 ? 1 : Math.max(...value.map((b) => b.blockOrder)) + 1;
    onChange([...value, { blockType: nextOrder === 1 ? 'hero' : 'text', blockOrder: nextOrder, content: {} }]);
  };

  return (
    <div className="space-y-3" data-testid="blocks-editor">
      {value.map((b, i) => (
        <div key={b.blockOrder} className="rounded border border-gray-200 p-3" data-testid={`block-row-${i}`}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">#{b.blockOrder}</span>
            <select
              aria-label={`Block ${i + 1} type`}
              data-testid={`block-type-${i}`}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              value={b.blockType}
              onChange={(e) => setBlock(i, { blockType: e.target.value })}
            >
              {BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="ml-auto flex gap-1">
              <button type="button" aria-label={`Move block ${i + 1} up`} disabled={i === 0}
                className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40" onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label={`Move block ${i + 1} down`} disabled={i === value.length - 1}
                className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40" onClick={() => move(i, 1)}>↓</button>
              <button type="button" aria-label={`Remove block ${i + 1}`}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={() => remove(i)}>Remove</button>
            </div>
          </div>
          <BlockContentFields type={b.blockType} content={b.content} onChange={(c) => setBlock(i, { content: c })} index={i} />
        </div>
      ))}
      <button type="button" data-testid="add-block" className="rounded border border-gray-300 px-3 py-1.5 text-sm" onClick={add}>+ Add block</button>
    </div>
  );
}

function BlockContentFields({ type, content, onChange, index }: { type: string; content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; index: number }) {
  if (JSON_TYPES.has(type)) {
    return <JsonField content={content} onChange={onChange} index={index} />;
  }
  const num = (k: string) => (content[k] as number | undefined) ?? '';
  const str = (k: string) => (content[k] as string | undefined) ?? '';
  const bool = (k: string) => Boolean(content[k]);
  // Setting a key to `undefined` DELETES it rather than persisting an empty
  // value. Block schemas use .min(1)/.strict(), so an empty string would fail
  // validation: dropping an optional key lets it validate as absent, and
  // dropping a required key surfaces a proper "required" server error.
  const set = (k: string, v: unknown) => {
    if (v === undefined) {
      const next = { ...content };
      delete next[k];
      onChange(next);
    } else {
      onChange({ ...content, [k]: v });
    }
  };
  const numField = (k: string, label: string) => (
    <label className="block text-xs text-gray-600">{label}
      <input type="number" data-testid={`field-${index}-${k}`} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        value={num(k)} onChange={(e) => set(k, e.target.value === '' ? undefined : Number(e.target.value))} />
    </label>
  );
  const textField = (k: string, label: string) => (
    <label className="block text-xs text-gray-600">{label}
      <input type="text" data-testid={`field-${index}-${k}`} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        value={str(k)} onChange={(e) => set(k, e.target.value === '' ? undefined : e.target.value)} />
    </label>
  );
  const boolField = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <input type="checkbox" data-testid={`field-${index}-${k}`} checked={bool(k)} onChange={(e) => set(k, e.target.checked)} />{label}
    </label>
  );
  // Toggle a document category. Rebuilds includeCategories in canonical
  // DOCUMENT_CATEGORIES order (independent of click order); drops the key
  // entirely when nothing is selected (optional + absent validates).
  const selectedCategories = Array.isArray(content.includeCategories) ? (content.includeCategories as string[]) : [];
  const toggleCategory = (cat: string, checked: boolean) => {
    const nextSet = new Set(selectedCategories);
    if (checked) nextSet.add(cat);
    else nextSet.delete(cat);
    const ordered = DOCUMENT_CATEGORIES.filter((c) => nextSet.has(c));
    set('includeCategories', ordered.length > 0 ? ordered : undefined);
  };

  switch (type) {
    case 'hero':
      return <div className="grid grid-cols-2 gap-2">{textField('headline', 'Headline')}{textField('subtitle', 'Subtitle')}{textField('ctaText', 'CTA text')}{textField('ctaTarget', 'CTA target')}</div>;
    case 'text':
      return <div className="grid grid-cols-2 gap-2">{textField('heading', 'Heading (optional)')}{textField('body', 'Body')}</div>;
    case 'announcements':
    case 'meetings':
      return <div className="grid grid-cols-2 gap-2">{numField('limit', 'Limit')}{numField('timeWindowDays', 'Time window (days)')}</div>;
    case 'documents':
      return <div className="grid grid-cols-2 gap-2">{numField('limit', 'Limit')}
        <fieldset className="block text-xs text-gray-600">
          <legend>Categories</legend>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
            {DOCUMENT_CATEGORIES.map((cat) => (
              <label key={cat} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid={`field-${index}-cat-${cat}`}
                  checked={selectedCategories.includes(cat)}
                  onChange={(e) => toggleCategory(cat, e.target.checked)}
                />
                {cat}
              </label>
            ))}
          </div>
        </fieldset></div>;
    case 'contact':
      return <div className="flex gap-4">{boolField('showBoard', 'Show board')}{boolField('showManagement', 'Show management')}</div>;
    default:
      return null;
  }
}

function JsonField({ content, onChange, index }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; index: number }) {
  const [raw, setRaw] = useState(() => JSON.stringify(content, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <textarea data-testid={`field-${index}-json`} className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs" rows={6}
        value={raw} onChange={(e) => {
          setRaw(e.target.value);
          try { onChange(JSON.parse(e.target.value)); setErr(null); } catch { setErr('Invalid JSON'); }
        }} />
      {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
