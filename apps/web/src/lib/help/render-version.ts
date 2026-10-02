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
 * Rendered HTML varies by section (same slug, different article), by the
 * community type being read (`<OnlyFor>` blocks, which `help:` links resolve),
 * and by board seat: a `help:` link to a board-only article is a link for a
 * board member and plain text for everyone else. Every other input to that
 * resolution (`reader.features`) is derived from the community type.
 */
export function helpArticleCacheKey(
  section: string,
  category: string,
  slug: string,
  contentHash: string,
  communityType: string,
  boardSeat: boolean,
): string {
  return `${section}:${category}:${slug}:${contentHash}:${communityType}:${boardSeat ? 'board' : 'no-board'}:v${HELP_RENDER_VERSION}`;
}
