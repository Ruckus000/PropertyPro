import type { CommunityTheme } from '@propertypro/theme';
import type { TextBlockContent } from '@propertypro/shared';

interface TextBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Text block — renders markdown-style or plain text content.
 *
 * For simplicity, "markdown" mode renders HTML-safe content via dangerouslySetInnerHTML
 * (content is stored by admins, not end-users). Plain text mode renders as paragraphs.
 */
export function TextBlock({ content, theme }: TextBlockProps) {
  const c = content as unknown as TextBlockContent;
  const body = c.body ?? '';
  const isMarkdown = c.markdown === true;

  if (!body) return null;

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8">
      <div
        className="max-w-4xl mx-auto"
        style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
      >
        {isMarkdown ? (
          <div
            className="prose prose-gray max-w-none"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {body}
          </div>
        )}
      </div>
    </section>
  );
}
