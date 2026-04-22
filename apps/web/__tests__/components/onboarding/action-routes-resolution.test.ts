import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_ROUTES } from '../../../src/components/onboarding/onboarding-checklist';

const APP_ROOT = path.resolve(__dirname, '../../../src/app/(authenticated)');
const CID = 42;

function isDynamicSegment(seg: string): boolean {
  return seg.startsWith('[') && seg.endsWith(']');
}

function pageExistsForPathname(pathname: string): boolean {
  const segments = pathname.replace(/^\/+/, '').split('/').filter(Boolean);

  function walk(dirSegments: string[], currentDir: string): boolean {
    if (dirSegments.length === 0) {
      return fs.existsSync(path.join(currentDir, 'page.tsx'));
    }
    const [next, ...rest] = dirSegments;
    const directMatch = path.join(currentDir, next);
    if (fs.existsSync(directMatch) && fs.statSync(directMatch).isDirectory()) {
      if (walk(rest, directMatch)) return true;
    }
    // Check any dynamic-segment siblings
    if (!fs.existsSync(currentDir)) return false;
    for (const entry of fs.readdirSync(currentDir)) {
      const full = path.join(currentDir, entry);
      if (isDynamicSegment(entry) && fs.statSync(full).isDirectory()) {
        if (walk(rest, full)) return true;
      }
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
