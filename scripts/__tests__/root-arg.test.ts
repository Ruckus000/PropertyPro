import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRootArg, RootArgError } from '../lib/root-arg';

describe('parseRootArg', () => {
  it.each([
    ['no arguments', [], undefined],
    ['--root <dir>', ['--root', '/tmp/x'], '/tmp/x'],
    ['--root=<dir>', ['--root=/tmp/x'], '/tmp/x'],
    ['a relative dir, against the cwd', ['--root', 'packages/ui/src'], resolve('packages/ui/src')],
  ])('accepts %s', (_label, argv, expected) => {
    expect(parseRootArg(argv)).toBe(expected);
  });

  // Each of these used to fall back to the default root in at least one guard,
  // which then scanned the wrong tree and passed.
  it.each([
    ['a bare --root', ['--root'], '--root needs a directory.'],
    ['an empty value', ['--root', ''], '--root needs a directory.'],
    ['an empty = value', ['--root='], '--root needs a directory.'],
    ['a flag in place of the value', ['--root', '--verbose'], '--root needs a directory.'],
    ['an unrecognised argument', ['--roots', '/tmp'], 'Unrecognised arguments: --roots /tmp'],
    ['a trailing extra argument', ['--root', '/tmp', 'x'], 'Unrecognised arguments: --root /tmp x'],
  ])('refuses %s', (_label, argv, message) => {
    expect(() => parseRootArg(argv)).toThrow(RootArgError);
    expect(() => parseRootArg(argv)).toThrow(message);
  });
});
