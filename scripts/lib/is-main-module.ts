/**
 * ESM main-module detection for guard scripts: "was THIS file invoked, or
 * merely imported (by a unit test)?"
 *
 * Why not the bare `import.meta.url === \`file://${process.argv[1]}\``
 * comparison most guards used: `import.meta.url` is realpath-resolved AND
 * percent-encoded, while `process.argv[1]` is neither. Whenever the invocation
 * path has a symlink component (macOS `/tmp` → `/private/tmp`, a symlinked
 * checkout) or a space, the two never match — main() silently never runs, the
 * process exits 0 having examined nothing, and the lint runner prints ✅ for a
 * guard that checked no population. Measured 2026-09-25: all 11 guards on the
 * bare form printed nothing and exited 0 when invoked through a symlink.
 *
 * Both sides are realpath-resolved and then compared as file URLs, so the
 * encoding and symlink differences cancel out.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const canonicalUrl = (path: string): string | null => {
  try {
    return pathToFileURL(realpathSync(path)).href;
  } catch {
    return null; // not on disk
  }
};

export function isMainModule(importMetaUrl: string, argv1: string | undefined = process.argv[1]): boolean {
  if (!argv1) return false;
  const invoked = canonicalUrl(argv1);
  if (invoked === null) return false; // argv[1] not on disk — imported, not invoked
  return invoked === canonicalUrl(fileURLToPath(importMetaUrl));
}
