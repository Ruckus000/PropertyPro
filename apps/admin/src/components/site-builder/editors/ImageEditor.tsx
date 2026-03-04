'use client';

/**
 * Image block editor — image URL, alt text, caption, width selector.
 */
import type { ImageContent } from '@propertypro/shared/site-blocks';

interface ImageEditorProps {
  content: ImageContent;
  onChange: (content: ImageContent) => void;
}

export function ImageEditor({ content, onChange }: ImageEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="image-url" className="mb-1 block text-xs font-medium text-gray-700">
          Image URL
        </label>
        <input
          id="image-url"
          type="url"
          value={content.imageUrl}
          onChange={(e) => onChange({ ...content, imageUrl: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="https://example.com/image.jpg"
        />
      </div>

      <div>
        <label htmlFor="image-alt" className="mb-1 block text-xs font-medium text-gray-700">
          Alt Text
        </label>
        <input
          id="image-alt"
          type="text"
          value={content.altText}
          onChange={(e) => onChange({ ...content, altText: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Describe the image for accessibility"
        />
      </div>

      <div>
        <label htmlFor="image-caption" className="mb-1 block text-xs font-medium text-gray-700">
          Caption (optional)
        </label>
        <input
          id="image-caption"
          type="text"
          value={content.caption ?? ''}
          onChange={(e) => onChange({ ...content, caption: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Image caption"
        />
      </div>

      <div>
        <label htmlFor="image-width" className="mb-1 block text-xs font-medium text-gray-700">
          Width
        </label>
        <select
          id="image-width"
          value={content.width ?? 'full'}
          onChange={(e) =>
            onChange({ ...content, width: e.target.value as 'full' | 'medium' | 'small' })
          }
          className="block w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="full">Full Width</option>
          <option value="medium">Medium</option>
          <option value="small">Small</option>
        </select>
      </div>

      {/* Preview */}
      {content.imageUrl && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-500">Preview</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.imageUrl}
            alt={content.altText || 'Preview'}
            className="max-h-40 rounded-md object-contain"
          />
        </div>
      )}
    </div>
  );
}
