'use client';

/**
 * Hero block editor — headline, subheadline, background image URL, CTA label/href.
 */
import type { HeroBlockContent } from '@propertypro/shared/site-blocks';

interface HeroEditorProps {
  blockId: number;
  content: HeroBlockContent;
  onChange: (content: HeroBlockContent) => void;
}

export function HeroEditor({ blockId, content, onChange }: HeroEditorProps) {
  const headlineId = `hero-headline-${blockId}`;
  const subheadlineId = `hero-subheadline-${blockId}`;
  const backgroundImageId = `hero-bg-image-${blockId}`;
  const ctaLabelId = `hero-cta-label-${blockId}`;
  const ctaHrefId = `hero-cta-href-${blockId}`;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={headlineId} className="mb-1 block text-xs font-medium text-gray-700">
          Headline
        </label>
        <input
          id={headlineId}
          type="text"
          maxLength={120}
          value={content.headline}
          onChange={(e) => onChange({ ...content, headline: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Welcome to Our Community"
        />
      </div>

      <div>
        <label htmlFor={subheadlineId} className="mb-1 block text-xs font-medium text-gray-700">
          Subheadline
        </label>
        <input
          id={subheadlineId}
          type="text"
          maxLength={300}
          value={content.subheadline}
          onChange={(e) => onChange({ ...content, subheadline: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Your community portal for documents, meetings, and more"
        />
      </div>

      <div>
        <label htmlFor={backgroundImageId} className="mb-1 block text-xs font-medium text-gray-700">
          Background Image URL
        </label>
        <input
          id={backgroundImageId}
          type="url"
          value={content.backgroundImageUrl ?? ''}
          onChange={(e) => onChange({ ...content, backgroundImageUrl: e.target.value || undefined })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="https://example.com/hero-image.jpg"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={ctaLabelId} className="mb-1 block text-xs font-medium text-gray-700">
            CTA Button Label
          </label>
          <input
            id={ctaLabelId}
            type="text"
            maxLength={40}
            value={content.ctaLabel}
            onChange={(e) => onChange({ ...content, ctaLabel: e.target.value })}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Get Started"
          />
        </div>
        <div>
          <label htmlFor={ctaHrefId} className="mb-1 block text-xs font-medium text-gray-700">
            CTA Button URL
          </label>
          <input
            id={ctaHrefId}
            type="text"
            value={content.ctaHref}
            onChange={(e) => onChange({ ...content, ctaHref: e.target.value })}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="/auth/login"
          />
        </div>
      </div>
    </div>
  );
}
