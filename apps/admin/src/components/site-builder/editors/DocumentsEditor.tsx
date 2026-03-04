'use client';

/**
 * Documents block editor — maxItems, optional categoryId, showFileSize toggle.
 */
import type { DocumentsContent } from '@propertypro/shared/site-blocks';

interface DocumentsEditorProps {
  content: DocumentsContent;
  onChange: (content: DocumentsContent) => void;
}

export function DocumentsEditor({ content, onChange }: DocumentsEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="docs-max" className="mb-1 block text-xs font-medium text-gray-700">
          Maximum Items to Show
        </label>
        <input
          id="docs-max"
          type="number"
          min={1}
          max={50}
          value={content.maxItems}
          onChange={(e) => onChange({ ...content, maxItems: Math.max(1, Number(e.target.value) || 1) })}
          className="block w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="docs-category" className="mb-1 block text-xs font-medium text-gray-700">
          Category ID (optional)
        </label>
        <input
          id="docs-category"
          type="number"
          min={1}
          value={content.categoryId ?? ''}
          onChange={(e) => {
            const val = Number(e.target.value);
            onChange({
              ...content,
              categoryId: Number.isInteger(val) && val > 0 ? val : undefined,
            });
          }}
          className="block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="All categories"
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={content.showFileSize}
          onChange={(e) => onChange({ ...content, showFileSize: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Show file sizes</span>
      </label>
    </div>
  );
}
