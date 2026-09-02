/**
 * AmenitiesBlock (Pro+) — content block rendering a heading plus a grid of
 * community amenities, each with a name and an optional one-line description.
 *
 * PM-authored marketing content (NOT the operational amenity-reservation
 * system). Server component, plain text only.
 */
import { amenitiesBlockSchema, type AmenitiesBlockContent } from '@propertypro/shared';
import type { BlockRendererProps } from './types';
import { variantWidth } from './block-variant';

export function AmenitiesBlock(props: BlockRendererProps) {
  const parsed = amenitiesBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'amenities block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: AmenitiesBlockContent = parsed.data;
  const headingId = content.heading ? `amenities-${props.block.id}` : undefined;

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={headingId}>
      <div className={`mx-auto ${variantWidth('grid', content.variant)}`}>
        {content.heading && (
          <h2 id={headingId} className="mb-6 font-heading text-2xl font-semibold text-content">
            {content.heading}
          </h2>
        )}
        <ul className="grid gap-4 sm:grid-cols-2">
          {content.items.map((item, i) => (
            <li key={i} className="rounded-md border border-edge bg-surface-card p-5">
              <p className="font-medium text-content">{item.name}</p>
              {item.description && (
                <p className="mt-1 text-sm text-content-secondary">{item.description}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
