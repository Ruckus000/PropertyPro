import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scan } from '../verify-page-template';

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

  it('passes an exempt page', () => {
    page('legacy', `// page-template:exempt — reason\n${PLAIN}`);
    expect(scan(base, [])).toMatchObject({ status: 0, exempt: 1 });
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
