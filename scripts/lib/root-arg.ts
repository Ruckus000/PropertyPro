/**
 * The `--root <dir>` / `--root=<dir>` seam that lets a guard's tests point it
 * at a fixture tree in os.tmpdir() instead of planting files in the repo.
 *
 * Every mistyped form throws instead of falling back to the default root,
 * because a fallback scan passes for the wrong reason: a bare `--root`, an
 * empty value (an unset shell variable), a flag where the directory should be,
 * and any argument the guard does not recognise. Callers map `RootArgError`
 * to exit 2, "could not check" (.claude/rules/verification.md).
 *
 * Relative paths resolve against the cwd. pnpm runs guards from the repo root.
 */
import { resolve } from 'node:path';

export class RootArgError extends Error {}

/** `undefined` when no arguments were given; otherwise the absolute root. */
export function parseRootArg(argv: readonly string[]): string | undefined {
  if (argv.length === 0) return undefined;

  let value: string | undefined;
  if (argv[0] === '--root' && argv.length <= 2) value = argv[1];
  else if (argv.length === 1 && argv[0]!.startsWith('--root=')) value = argv[0]!.slice('--root='.length);
  else throw new RootArgError(`Unrecognised arguments: ${argv.join(' ')}`);

  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new RootArgError('--root needs a directory.');
  }
  return resolve(value);
}
