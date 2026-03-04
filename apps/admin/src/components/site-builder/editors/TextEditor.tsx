'use client';

/**
 * Text block editor — body text and alignment selector.
 */
import type { TextContent } from '@propertypro/shared/site-blocks';

interface TextEditorProps {
  content: TextContent;
  onChange: (content: TextContent) => void;
}

export function TextEditor({ content, onChange }: TextEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="text-body" className="mb-1 block text-xs font-medium text-gray-700">
          Body Text
        </label>
        <textarea
          id="text-body"
          value={content.body}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          rows={6}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Enter your text here..."
        />
      </div>

      <div>
        <label htmlFor="text-alignment" className="mb-1 block text-xs font-medium text-gray-700">
          Text Alignment
        </label>
        <select
          id="text-alignment"
          value={content.alignment ?? 'left'}
          onChange={(e) =>
            onChange({ ...content, alignment: e.target.value as 'left' | 'center' | 'right' })
          }
          className="block w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
    </div>
  );
}
