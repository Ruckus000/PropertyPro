import type { CommunityTheme } from '@propertypro/theme';
import type { TextBlockContent } from '@propertypro/shared';

interface TextBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Text block — renders plain text content as paragraphs.
 */
export function TextBlock({ content, theme }: TextBlockProps) {
  const c = content as unknown as TextBlockContent;
  const body = c.body ?? '';

  if (!body) return null;

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8">
      <div
        className="max-w-4xl mx-auto"
        style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
      >
        <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
          {body}
        </div>
      </div>
    </section>
  );
}
