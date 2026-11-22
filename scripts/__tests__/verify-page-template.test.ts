import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { planBaselineWrite, scan, writeBaseline } from '../verify-page-template';

/** Fixtures live under os.tmpdir(); nothing here writes inside the repo. */
const APP = 'apps/web/src/app';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let base: string;

function write(rel: string, content: string): string {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return rel;
}
const page = (route: string, content: string) => write(`${APP}/(authenticated)/${route}/page.tsx`, content);

const LAYOUT = `export const V = () => <PageLayout title="x"><p>hi</p></PageLayout>;\n`;
const PLAIN = `export default function P() { return <div>hi</div>; }\n`;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'guard-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('scan', () => {
  it('passes on the real repo with its baseline, with a non-zero population', () => {
    const r = scan(repoRoot);
    expect(r.violations).toEqual([]);
    expect(r.stale).toEqual([]);
    expect(r.status).toBe(0);
    expect(r.pages).toBeGreaterThan(0);
  });

  it('reports a page with no PageLayout, by path', () => {
    const bad = page('widgets', PLAIN);
    page('ok', `export default function P() { return <PageLayout title="x" />; }\n`);
    const r = scan(base, []);
    expect(r.status).toBe(1);
    expect(r.violations.map((v) => v.file)).toEqual([bad]);
    expect(r.compliant).toBe(1);
  });

  it('passes a redirect-only page, but not a redirect page that also renders JSX', () => {
    page('go', `import { redirect } from 'next/navigation';\nexport default function P() { redirect('/x'); }\n`);
    expect(scan(base, [])).toMatchObject({ status: 0, redirectOnly: 1 });
    const mixed = page('mixed', `export default function P() { if (a) redirect('/x'); return <div/>; }\n`);
    expect(scan(base, []).violations.map((v) => v.file)).toEqual([mixed]);
  });

  it('passes an exempt page that gives a reason (em dash or hyphen)', () => {
    page('legacy', `// page-template:exempt — reason\n${PLAIN}`);
    page('legacy2', `// page-template:exempt - reason\n${PLAIN}`);
    expect(scan(base, [])).toMatchObject({ status: 0, exempt: 2 });
  });

  it('does not pass a bare exemption with no reason', () => {
    const bare = page('bare', `// page-template:exempt\n${PLAIN}`);
    const dash = page('dash', `// page-template:exempt —\n${PLAIN}`);
    const r = scan(base, []);
    expect(r.status).toBe(1);
    expect(r.violations.map((v) => v.file).sort()).toEqual([bare, dash].sort());
    expect(r.exempt).toBe(0);
  });

  it('does not count PageLayout in a comment or a string', () => {
    const c = page('c', `// <PageLayout>\nexport default () => <div>{'<PageLayout'}</div>;\n`);
    expect(scan(base, []).violations.map((v) => v.file)).toEqual([c]);
  });

  it('does not count redirect( inside a string as a redirect page', () => {
    const s = page('s', `export default function P() { return "redirect('/x')"; }\n`);
    expect(scan(base, []).violations.map((v) => v.file)).toEqual([s]);
  });

  it('counts JSX inside a nested function, so redirect plus nested JSX fails', () => {
    const n = page('n', `export default function P() { const Inner = () => <b/>; redirect('/x'); }\n`);
    expect(scan(base, []).violations.map((v) => v.file)).toEqual([n]);
  });

  it('does not follow a symlink when listing pages', async () => {
    const { symlinkSync } = await import('node:fs');
    const target = join(base, 'elsewhere');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'page.tsx'), PLAIN);
    page('ok', LAYOUT);
    symlinkSync(target, join(base, APP, '(authenticated)', 'link'));
    expect(scan(base, [])).toMatchObject({ status: 0, pages: 1 });
  });

  describe('delegation', () => {
    const delegating = (list: string) =>
      page('d', `// breadcrumbs:exempt — x\n// page-template: delegated to ${list}\n${PLAIN}`);

    it('passes when every named view holds <PageLayout', () => {
      write('a.tsx', LAYOUT);
      write('b.tsx', LAYOUT);
      delegating('a.tsx, b.tsx');
      expect(scan(base, [])).toMatchObject({ status: 0, compliant: 1 });
    });

    it('fails naming the second view when only the first holds <PageLayout', () => {
      write('a.tsx', LAYOUT);
      write('b.tsx', PLAIN);
      delegating('a.tsx, b.tsx');
      const r = scan(base, []);
      expect(r.status).toBe(1);
      expect(r.violations[0]!.reason).toContain('b.tsx');
      expect(r.violations[0]!.reason).not.toContain('a.tsx');
    });

    it('fails when a named view does not exist', () => {
      write('a.tsx', LAYOUT);
      delegating('a.tsx, b.tsx');
      const r = scan(base, []);
      expect(r.status).toBe(1);
      expect(r.violations[0]!.reason).toContain('b.tsx (does not exist)');
    });

    it('reports a delegated path that escapes the root, even when it holds <PageLayout', () => {
      const outside = join(dirname(base), `outside-${Date.now()}.tsx`);
      writeFileSync(outside, LAYOUT);
      try {
        delegating(`../${outside.split('/').pop()}`);
        const r = scan(base, []);
        expect(r.status).toBe(1);
        expect(r.violations[0]!.reason).toContain('(outside the root)');
        delegating(outside);
      } finally {
        rmSync(outside, { force: true });
      }
    });

    it('reports an absolute delegated path as outside the root', () => {
      const abs = write('abs.tsx', LAYOUT);
      page('abs', `// page-template: delegated to ${join(base, abs)}\n${PLAIN}`);
      expect(scan(base, []).violations[0]!.reason).toContain('(outside the root)');
    });

    it('ignores a delegation comment that is not in the leading comment block', () => {
      write('a.tsx', LAYOUT);
      page('late', `${PLAIN}// page-template: delegated to a.tsx\n`);
      expect(scan(base, []).status).toBe(1);
    });
  });

  describe('baseline', () => {
    it('counts a baselined failing page and does not fail it', () => {
      const bad = page('old', PLAIN);
      expect(scan(base, [bad])).toMatchObject({ status: 0, baselined: 1, violations: [] });
    });

    it('reports a baseline entry for a page that now passes as stale', () => {
      const ok = page('fixed', LAYOUT);
      const r = scan(base, [ok]);
      expect(r.status).toBe(1);
      expect(r.stale).toEqual([ok]);
    });

    it('reports a baseline entry for a missing file as stale', () => {
      page('ok', LAYOUT);
      const r = scan(base, [`${APP}/(authenticated)/gone/page.tsx`]);
      expect(r.status).toBe(1);
      expect(r.stale).toHaveLength(1);
    });
  });

  it('excludes mobile and unlisted groups', () => {
    write(`${APP}/mobile/page.tsx`, PLAIN);
    write(`${APP}/(marketing)/page.tsx`, PLAIN);
    page('ok', LAYOUT);
    expect(scan(base, [])).toMatchObject({ status: 0, pages: 1 });
  });

  it('refuses (2) on an empty directory, a missing one, and an unparseable page', () => {
    expect(scan(base, []).status).toBe(2);
    expect(scan(join(base, 'nope'), []).status).toBe(2);
    mkdirSync(join(base, APP, '(authenticated)'), { recursive: true });
    expect(scan(base, []).status).toBe(2);
    page('broken', 'const = <');
    expect(scan(base, []).status).toBe(2);
  });
});

describe('baseline writing', () => {
  const quiet = () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  };
  afterEach(() => vi.restoreAllMocks());
  const baselineFile = () => join(base, 'scripts/page-template-baseline.json');
  const seed = (paths: unknown) => write('scripts/page-template-baseline.json', JSON.stringify(paths));

  it('planBaselineWrite: shrinking an existing baseline is free; growth and a missing file need force', () => {
    expect(planBaselineWrite(['a', 'b'], ['a'], false).ok).toBe(true);
    expect(planBaselineWrite(['a'], ['a', 'b'], false)).toMatchObject({ ok: false, added: ['b'] });
    expect(planBaselineWrite(null, ['a'], false).ok).toBe(false);
    expect(planBaselineWrite(null, ['a'], true).ok).toBe(true);
    // a missing file is refused even when nothing would be added (an empty re-seed)
    expect(planBaselineWrite(null, [], false).ok).toBe(false);
    expect(planBaselineWrite(null, [], true).ok).toBe(true);
    expect(planBaselineWrite(['a'], ['a', 'b'], true).ok).toBe(true);
  });

  it('writeBaseline: shrink ok; grow refused; missing refused, then written with force', () => {
    quiet();
    const bad = page('bad', PLAIN);
    const bad2 = page('bad2', PLAIN);
    seed([bad, bad2, `${APP}/(authenticated)/gone/page.tsx`]);
    expect(writeBaseline(base, false)).toBe(0);
    expect(JSON.parse(readFileSync(baselineFile(), 'utf8'))).toEqual([bad, bad2].sort());

    seed([bad]);
    expect(writeBaseline(base, false)).toBe(1);
    expect(JSON.parse(readFileSync(baselineFile(), 'utf8'))).toEqual([bad]);

    rmSync(baselineFile());
    expect(writeBaseline(base, false)).toBe(1);
    expect(existsSync(baselineFile())).toBe(false);
    expect(writeBaseline(base, true)).toBe(0);
    expect(JSON.parse(readFileSync(baselineFile(), 'utf8'))).toEqual([bad, bad2].sort());
  });

  it('writeBaseline refuses to seed a missing baseline even when no page fails', () => {
    quiet();
    page('ok', LAYOUT);
    expect(writeBaseline(base, false)).toBe(1);
    expect(existsSync(baselineFile())).toBe(false);
  });

  it('writeBaseline exits 2, not a stack trace, on a malformed or wrong-shape baseline', () => {
    quiet();
    page('bad', PLAIN);
    seed({ not: 'an array' });
    expect(writeBaseline(base, true)).toBe(2);
    seed([1, 2]);
    expect(writeBaseline(base, true)).toBe(2);
    write('scripts/page-template-baseline.json', '{ nope');
    expect(writeBaseline(base, true)).toBe(2);
  });

  it('scan refuses (2) when the baseline file is not a string array', () => {
    page('ok', LAYOUT);
    seed([1]);
    expect(scan(base).status).toBe(2);
    seed({ a: 1 });
    expect(scan(base).status).toBe(2);
  });
});
