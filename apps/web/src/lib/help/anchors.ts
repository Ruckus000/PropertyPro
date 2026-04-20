/**
 * Shared slug generator for help article heading anchors.
 *
 * Used by both the raw-MDX TOC extractor ([toc.ts](./toc.ts)) and the MDX
 * component renderers ([mdx-components.tsx](../../components/help/mdx-components.tsx))
 * so that TOC links always resolve to the correct heading id.
 *
 * Authoring constraint: two headings at the same depth with identical text will
 * produce the same anchor. The TOC entry for the second occurrence will scroll
 * to the first. Avoid duplicate h2/h3 text within a single article.
 */
export function slugifyHeading(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
