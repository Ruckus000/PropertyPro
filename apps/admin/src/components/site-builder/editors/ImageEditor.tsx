'use client';

/**
 * Image block editor — image URL, alt text, optional caption.
 */
import type { ImageBlockContent } from '@propertypro/shared/site-blocks';

interface ImageEditorProps {
  content: ImageBlockContent;
  onChange: (content: ImageBlockContent) => void;
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
          value={content.url}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
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
          maxLength={200}
          value={content.alt}
          onChange={(e) => onChange({ ...content, alt: e.target.value })}
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
          maxLength={300}
          value={content.caption ?? ''}
          onChange={(e) => onChange({ ...content, caption: e.target.value || undefined })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Image caption"
        />
      </div>

      {/* Preview */}
      {content.url && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-500">Preview</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.url}
            alt={content.alt || 'Preview'}
            className="max-h-40 rounded-md object-contain"
          />
        </div>
      )}
    </div>
  );
}
