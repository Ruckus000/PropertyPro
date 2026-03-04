'use client';

/**
 * Documents block editor — title and category filter.
 */
import type { DocumentsBlockContent } from '@propertypro/shared/site-blocks';

interface DocumentsEditorProps {
  content: DocumentsBlockContent;
  onChange: (content: DocumentsBlockContent) => void;
}

export function DocumentsEditor({ content, onChange }: DocumentsEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="docs-title" className="mb-1 block text-xs font-medium text-gray-700">
          Section Title
        </label>
        <input
          id="docs-title"
          type="text"
          value={content.title}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Documents"
        />
      </div>

      <div>
        <label htmlFor="docs-categories" className="mb-1 block text-xs font-medium text-gray-700">
          Category IDs (comma-separated, empty = all)
        </label>
        <input
          id="docs-categories"
          type="text"
          value={content.categoryIds.join(', ')}
          onChange={(e) => {
            const ids = e.target.value
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n) && n > 0);
            onChange({ ...content, categoryIds: ids });
          }}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Leave empty to show all categories"
        />
      </div>
    </div>
  );
}
