import type { TocItem } from '@/components/help/mdx-components';

/**
 * Extract heading-based table-of-contents entries from raw MDX.
 *
 * Only h2 and h3 are captured — deeper levels rarely surface as top-level
 * navigation and would clutter the TOC sidebar. Anchor slugs are generated
 * deterministically so matching id attributes on headings can be added later.
 *
 * We parse the raw MDX (not the compiled output) so this runs on the server
 * during page render without needing a client-side mutation observer.
 */
export function extractTableOfContents(rawMdx: string): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Map<string, number>();
  const lines = rawMdx.split('\n');
  let inFence = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const depth = match[1]!.length as 2 | 3;
    const rawLabel = match[2]!.trim();
    const label = rawLabel.replace(/^["']|["']$/g, '');

    const baseAnchor = label
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);

    const previous = seen.get(baseAnchor) ?? 0;
    seen.set(baseAnchor, previous + 1);
    const anchor = previous === 0 ? baseAnchor : `${baseAnchor}-${previous + 1}`;

    items.push({ depth, label, anchor });
  }

  return items;
}
