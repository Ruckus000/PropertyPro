import type { CommunityTheme } from '@propertypro/theme';
import type { ImageBlockContent } from '@propertypro/shared';

interface ImageBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Image block — renders an image with optional caption as a <figure>.
 */
export function ImageBlock({ content, theme }: ImageBlockProps) {
  const c = content as unknown as ImageBlockContent;
  const url = c.url;
  const alt = c.alt ?? '';
  const caption = c.caption;

  if (!url) return null;

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8">
      <figure className="max-w-4xl mx-auto">
        <img
          src={url}
          alt={alt}
          className="w-full rounded-lg shadow-md"
          loading="lazy"
        />
        {caption ? (
          <figcaption
            className="mt-3 text-center text-sm text-gray-500"
            style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
          >
            {caption}
          </figcaption>
        ) : null}
      </figure>
    </section>
  );
}
