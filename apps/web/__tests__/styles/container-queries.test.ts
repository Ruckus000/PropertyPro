/**
 * The `cq` container-query vocabulary: `.cq` declares a container named `cq`,
 * and `cq-sm|md|lg:` respond to its width (480 / 720 / 960px) rather than the
 * window. Defined identically in `apps/web` and `apps/admin` Tailwind configs.
 *
 * The sharp edge is the same as `site-frame`: a `cq-*` variant with no `.cq`
 * ancestor never matches, so the element silently keeps its narrow layout on
 * every screen. Nothing else would notice, so this test does.
 *
 * The container is named `cq`, never `site`, so these variants can never
 * match the public site's `.site-frame` container.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';
import adminConfig from '../../../admin/tailwind.config';

const WEB_SRC = join(__dirname, '..', '..', 'src');
const ADMIN_SRC = join(__dirname, '..', '..', '..', 'admin', 'src');
const UI_SRC = join(__dirname, '..', '..', '..', '..', 'packages', 'ui', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

async function compile(cfg: typeof config, raw: string): Promise<string> {
  const result = await postcss([
    tailwind({
      ...cfg,
      content: [{ raw, extension: 'html' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css.replace(/\s+/g, ' ');
}

describe.each([
  ['web', config],
  ['admin', adminConfig],
] as const)('cq variants (%s config)', (_name, cfg) => {
  it('compile to container queries against the named cq container', async () => {
    const css = await compile(
      cfg as typeof config,
      'cq cq-sm:flex-row cq-md:grid-cols-2 cq-lg:grid-cols-3',
    );
    expect(css).toContain('container-type: inline-size');
    expect(css).toContain('container-name: cq');
    expect(css).toMatch(/@container cq \(min-width: 480px\) \{ \.cq-sm\\:flex-row/);
    expect(css).toMatch(/@container cq \(min-width: 720px\) \{ \.cq-md\\:grid-cols-2/);
    expect(css).toMatch(/@container cq \(min-width: 960px\) \{ \.cq-lg\\:grid-cols-3/);
  });

  it('never targets the public site container', async () => {
    const css = await compile(cfg as typeof config, 'cq cq-sm:flex-row');
    expect(css).not.toContain('@container site');
  });
});

/**
 * A file using `cq-*:` must also carry the `cq` class as a WHOLE token
 * (`\bcq\b` would match inside `cq-sm:` — the hyphen is a word boundary —
 * and could never fail), or be listed here as rendered inside a `.cq` parent.
 */
const CQ_USER = /(?<![\w-])cq-(sm|md|lg):/;
const CQ_TOKEN = /(^|[\s"'`])cq(?=[\s"'`]|$)/;

/** Files using `cq-*:` without their own `.cq` element, each with the reason. */
const NOT_ROOTS: Record<string, string> = {};

describe('cq-* variants have a .cq container ancestor', () => {
  const roots = [WEB_SRC, ADMIN_SRC, UI_SRC];
  const files = roots.flatMap((root) => walk(root));

  it('scans a non-empty tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  const users = files
    .filter((file) => CQ_USER.test(readFileSync(file, 'utf8')))
    .map((file) => ({ file, rel: relative(join(WEB_SRC, '..', '..', '..'), file) }));

  it('finds at least one consumer (anti-vacuity)', () => {
    expect(users.length).toBeGreaterThan(0);
  });

  it('each consumer carries a whole-token `cq` class or is allowlisted with a reason', () => {
    const offenders = users
      .filter(({ file, rel }) => !CQ_TOKEN.test(readFileSync(file, 'utf8')) && !(rel in NOT_ROOTS))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it('every allowlist entry still names a consumer (no stale entries)', () => {
    const rels = new Set(users.map(({ rel }) => rel));
    expect(Object.keys(NOT_ROOTS).filter((rel) => !rels.has(rel))).toEqual([]);
  });
});
