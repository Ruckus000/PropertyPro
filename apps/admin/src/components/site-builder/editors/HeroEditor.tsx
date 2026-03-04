'use client';

/**
 * Hero block editor — headline, subheading, background image URL, CTA text/URL.
 */
import type { HeroContent } from '@propertypro/shared/site-blocks';

interface HeroEditorProps {
  content: HeroContent;
  onChange: (content: HeroContent) => void;
}

export function HeroEditor({ content, onChange }: HeroEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="hero-headline" className="mb-1 block text-xs font-medium text-gray-700">
          Headline
        </label>
        <input
          id="hero-headline"
          type="text"
          value={content.headline}
          onChange={(e) => onChange({ ...content, headline: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Welcome to Our Community"
        />
      </div>

      <div>
        <label htmlFor="hero-subheading" className="mb-1 block text-xs font-medium text-gray-700">
          Subheading
        </label>
        <input
          id="hero-subheading"
          type="text"
          value={content.subheading ?? ''}
          onChange={(e) => onChange({ ...content, subheading: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Your community portal for documents, meetings, and more"
        />
      </div>

      <div>
        <label htmlFor="hero-bg-image" className="mb-1 block text-xs font-medium text-gray-700">
          Background Image URL
        </label>
        <input
          id="hero-bg-image"
          type="url"
          value={content.backgroundImageUrl ?? ''}
          onChange={(e) => onChange({ ...content, backgroundImageUrl: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="https://example.com/hero-image.jpg"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="hero-cta-text" className="mb-1 block text-xs font-medium text-gray-700">
            CTA Button Text
          </label>
          <input
            id="hero-cta-text"
            type="text"
            value={content.ctaText ?? ''}
            onChange={(e) => onChange({ ...content, ctaText: e.target.value })}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Get Started"
          />
        </div>
        <div>
          <label htmlFor="hero-cta-url" className="mb-1 block text-xs font-medium text-gray-700">
            CTA Button URL
          </label>
          <input
            id="hero-cta-url"
            type="url"
            value={content.ctaUrl ?? ''}
            onChange={(e) => onChange({ ...content, ctaUrl: e.target.value })}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="/documents"
          />
        </div>
      </div>
    </div>
  );
}
