import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_ROUTES } from '../../../src/components/onboarding/onboarding-checklist';

// Rooted at `src/app`, not at one route group.
//
// It used to start inside `(authenticated)`, which quietly made this test unable
// to see any page in a sibling group — so a checklist item pointing at a real
// page in `(site-editor)` failed as "no page.tsx found". Route groups are
// organisational only and contribute nothing to the URL, so the walk treats them
// the way Next does: transparent.
const APP_ROOT = path.resolve(__dirname, '../../../src/app');
const CID = 42;

function isDynamicSegment(seg: string): boolean {
  return seg.startsWith('[') && seg.endsWith(']');
}

function isRouteGroup(seg: string): boolean {
  return seg.startsWith('(') && seg.endsWith(')');
}

function pageExistsForPathname(pathname: string): boolean {
  const segments = pathname.replace(/^\/+/, '').split('/').filter(Boolean);

  function walk(dirSegments: string[], currentDir: string): boolean {
    if (!fs.existsSync(currentDir)) return false;

    if (dirSegments.length === 0) {
      if (fs.existsSync(path.join(currentDir, 'page.tsx'))) return true;
      // A group can also sit at the leaf, e.g. /foo/(group)/page.tsx.
      return fs
        .readdirSync(currentDir)
        .some(
          (entry) =>
            isRouteGroup(entry) &&
            fs.statSync(path.join(currentDir, entry)).isDirectory() &&
            walk([], path.join(currentDir, entry)),
        );
    }

    const [next, ...rest] = dirSegments;
    const directMatch = path.join(currentDir, next!);
    if (fs.existsSync(directMatch) && fs.statSync(directMatch).isDirectory()) {
      if (walk(rest, directMatch)) return true;
    }

    for (const entry of fs.readdirSync(currentDir)) {
      const full = path.join(currentDir, entry);
      if (!fs.statSync(full).isDirectory()) continue;
      // Descend THROUGH a group without consuming a URL segment.
      if (isRouteGroup(entry) && walk(dirSegments, full)) return true;
      if (isDynamicSegment(entry) && walk(rest, full)) return true;
    }
    return false;
  }

  return walk(segments, APP_ROOT);
}

describe('ACTION_ROUTES — every href resolves to a real page', () => {
  it.each(Object.entries(ACTION_ROUTES))(
    '%s resolves to an existing page.tsx',
    (key, action) => {
      const href = action.href(CID);
      const pathname = href.split('?')[0] ?? href;
      expect(
        pageExistsForPathname(pathname),
        `ACTION_ROUTES["${key}"] => ${href} — no page.tsx found at ${pathname}`,
      ).toBe(true);
    },
  );
});
