'use client';

/**
 * Text block editor — body text with character count.
 */
import type { TextBlockContent } from '@propertypro/shared/site-blocks';

interface TextEditorProps {
  blockId: number;
  content: TextBlockContent;
  onChange: (content: TextBlockContent) => void;
}

export function TextEditor({ blockId, content, onChange }: TextEditorProps) {
  const bodyId = `text-body-${blockId}`;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={bodyId} className="mb-1 block text-xs font-medium text-gray-700">
          Body Text
        </label>
        <textarea
          id={bodyId}
          value={content.body}
          maxLength={5000}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          rows={6}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Enter your text here..."
        />
        <p className="mt-1 text-xs text-gray-400">{content.body.length} / 5000</p>
      </div>
    </div>
  );
}
