'use client';

/**
 * Text block editor — body text with character count.
 */
import type { TextBlockContent } from '@propertypro/shared/site-blocks';

interface TextEditorProps {
  content: TextBlockContent;
  onChange: (content: TextBlockContent) => void;
}

export function TextEditor({ content, onChange }: TextEditorProps) {
  const format = content.format ?? 'plain';

  return (
    <div className="space-y-4">
      <fieldset className="flex gap-4">
        <legend className="mb-1 block text-xs font-medium text-gray-700">Format</legend>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="radio"
            name="text-format"
            value="plain"
            checked={format === 'plain'}
            onChange={() => onChange({ ...content, format: 'plain' })}
          />
          Plain Text
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="radio"
            name="text-format"
            value="markdown"
            checked={format === 'markdown'}
            onChange={() => onChange({ ...content, format: 'markdown' })}
          />
          Markdown
        </label>
      </fieldset>

      <div>
        <label htmlFor="text-body" className="mb-1 block text-xs font-medium text-gray-700">
          Body Text
        </label>
        <textarea
          id="text-body"
          value={content.body}
          maxLength={5000}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          rows={6}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={format === 'markdown' ? '# Heading\n\nWrite **markdown** here...' : 'Enter your text here...'}
        />
        <p className="mt-1 text-xs text-gray-400">{content.body.length} / 5000</p>
      </div>
    </div>
  );
}
