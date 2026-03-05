import type { CommunityTheme } from '@propertypro/theme';
import type { TextBlockContent } from '@propertypro/shared';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

interface TextBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Text block — renders plain text or sanitized markdown content.
 */
export function TextBlock({ content, theme }: TextBlockProps) {
  const c = content as unknown as TextBlockContent;
  const body = c.body ?? '';
  const format = c.format ?? 'plain';

  if (!body) return null;

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8">
      <div
        className="max-w-4xl mx-auto"
        style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
      >
        {format === 'markdown' ? (
          <div
            className="prose prose-gray max-w-none"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(
                marked.parse(body, { async: false }) as string,
              ),
            }}
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
