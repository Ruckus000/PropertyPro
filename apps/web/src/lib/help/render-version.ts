/**
 * Version stamp for server-rendered help article HTML.
 *
 * The compiled HTML for the help modal is stored in `unstable_cache`, which
 * persists across deployments on Vercel. The content hash alone cannot see
 * changes to the MDX component markup (mdx-components.tsx, MediaFrame, …) —
 * bump this constant whenever a component change alters rendered output, or
 * stale markup will be served for every article whose MDX didn't change.
 */
export const HELP_RENDER_VERSION = 3;

/**
 * Rendered HTML varies by section (same slug, different article) and by the
 * community type being read (`<OnlyFor>` blocks, which `help:` links resolve).
 */
export function helpArticleCacheKey(
  section: string,
  category: string,
  slug: string,
  contentHash: string,
  communityType: string,
): string {
  return `${section}:${category}:${slug}:${contentHash}:${communityType}:v${HELP_RENDER_VERSION}`;
}
