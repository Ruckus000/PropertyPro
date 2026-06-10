/**
 * Version stamp for server-rendered help article HTML.
 *
 * The compiled HTML for the help modal is stored in `unstable_cache`, which
 * persists across deployments on Vercel. The content hash alone cannot see
 * changes to the MDX component markup (mdx-components.tsx, MediaFrame, …) —
 * bump this constant whenever a component change alters rendered output, or
 * stale markup will be served for every article whose MDX didn't change.
 */
export const HELP_RENDER_VERSION = 2;

export function helpArticleCacheKey(
  category: string,
  slug: string,
  contentHash: string,
): string {
  return `${category}:${slug}:${contentHash}:v${HELP_RENDER_VERSION}`;
}
