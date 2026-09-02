/**
 * FaqBlock (Pro+) — content block rendering a heading plus a list of
 * collapsible question/answer pairs.
 *
 * Server component, no client island: each item is a native <details>/<summary>
 * disclosure (keyboard-accessible, exposes expanded state without JS). Plain
 * text only — React escapes the question/answer strings.
 */
import { faqBlockSchema, type FaqBlockContent } from '@propertypro/shared';
import type { BlockRendererProps } from './types';

function toParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function FaqBlock(props: BlockRendererProps) {
  const parsed = faqBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'faq block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: FaqBlockContent = parsed.data;
  const headingId = content.heading ? `faq-${props.block.id}` : undefined;

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={headingId}>
      <div className="mx-auto max-w-3xl">
        {content.heading && (
          <h2 id={headingId} className="mb-6 font-heading text-2xl font-semibold text-content">
            {content.heading}
          </h2>
        )}
        <div className="space-y-3">
          {content.items.map((item, i) => (
            <details key={i} className="group rounded-md border border-edge bg-surface-card">
              <summary className="cursor-pointer px-4 py-3 font-medium text-content marker:text-content-secondary">
                {item.question}
              </summary>
              <div className="px-4 pb-4 text-base text-content-secondary">
                {toParagraphs(item.answer).map((p, j) => (
                  <p key={j} className={j > 0 ? 'mt-3' : undefined}>
                    {p}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
