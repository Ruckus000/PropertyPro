// Resolves the repo root from THIS FILE's location, by walking up to the
// directory that owns pnpm-workspace.yaml.
//
// Why not a hardcoded absolute path (what these scripts used to do): it breaks
// in every other clone, worktree and CI checkout.
//
// Why not process.cwd() or argv: the root decides where every other script
// reads and writes, so deriving it from caller-controlled input would turn a
// wrong cwd into writes outside the repo. Walking up from import.meta.url is
// deterministic and depends on nothing the caller can influence.
//
// Note these scripts are COMMITTED at .design-sync/scripts/ but RUN from
// .ds-sync/ (build.sh copies them). The walk handles both, and any depth.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;            // hit the filesystem root
    dir = parent;
  }
  throw new Error(
    `design-sync: could not locate the repo root above ${startDir} ` +
      '(looked for pnpm-workspace.yaml). Run these scripts from inside the repo.',
  );
}

export const ROOT = findRoot(resolve(dirname(fileURLToPath(import.meta.url))));
export const at = (...parts) => join(ROOT, ...parts);
