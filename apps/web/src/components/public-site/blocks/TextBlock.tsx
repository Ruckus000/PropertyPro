import { textBlockSchema, type TextBlockContent } from '@propertypro/shared';
import type { BlockRendererProps } from './types';
import { variantWidth } from './block-variant';

export function TextBlock(props: BlockRendererProps) {
  const parsed = textBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'text block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: TextBlockContent = parsed.data;
  const paragraphs = content.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className={`mx-auto ${variantWidth('prose', content.variant)}`}>
        {content.heading && (
          <h2 className="font-heading text-2xl font-semibold text-content mb-4">
            {content.heading}
          </h2>
        )}
        <div className="space-y-4 text-base text-content">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
