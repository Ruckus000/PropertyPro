import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SCAN_ROOTS, checkPageStateCopy } from '../verify-page-state-copy';

/**
 * Fixture tests for `pnpm guard:page-state-copy`. The guard's own header
 * records that its FIRST version — a whitelist of six phrases — passed a new
 * inline claim with exit 0. The probe sentence from that review round is
 * pinned here, so narrowing the vocabulary again turns this file red.
 */
const EDITOR = 'apps/web/src/components/pm/site-editor-v3';
let base: string;

function write(rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Every root exists and holds one file with no visibility copy. */
function scaffold(): void {
  for (const root of SCAN_ROOTS) write(`${root}/clean.ts`, "export const label = 'Save';\n");
}

const errors = () =>
  vi
    .mocked(console.error)
    .mock.calls.map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'page-state-copy-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkPageStateCopy', () => {
  it('passes on the real repo against its committed baseline', () => {
    expect(checkPageStateCopy()).toBe(0);
  });

  it('passes (0) on a tree with no visibility copy', () => {
    scaffold();
    write(`${EDITOR}/toolbar.tsx`, 'export const T = () => <button>Rename page</button>;\n');
    expect(checkPageStateCopy(base, {})).toBe(0);
  });

  it('FAILS (1) on the review-round probe sentence that beat the first version', () => {
    scaffold();
    const rel = `${EDITOR}/pages-panel.tsx`;
    write(
      rel,
      'export const hint =\n  "Visitors can see this page right now. It is on your public site already.";\n',
    );
    expect(checkPageStateCopy(base, {})).toBe(1);
    expect(errors()).toContain(`${rel}: 1 page-visibility claim, ceiling 0`);
    expect(errors()).toContain(`${rel}:2`);
  });

  it('scans the website home too: a new claim there FAILS (1)', () => {
    scaffold();
    const rel = 'apps/web/src/components/website-home/records-card.tsx';
    write(rel, 'export const hint = "Visitors can see your records now.";\n');
    expect(checkPageStateCopy(base, {})).toBe(1);
    expect(errors()).toContain(`${rel}: 1 page-visibility claim, ceiling 0`);
  });

  it('skips comment lines, exempt lines, and the describer modules', () => {
    scaffold();
    write(
      `${EDITOR}/notes.tsx`,
      '// visitors never see a draft\n * on your public site\n' +
        "const a = 'live site'; // page-state-copy:exempt — link label\n",
    );
    write('apps/web/src/lib/site-editor/describe-page-state.ts', "export const s = 'Visitors can see this page.';\n");
    write('apps/web/src/lib/site-editor/describe-section-state.ts', "export const s = 'on your site now';\n");
    expect(checkPageStateCopy(base, {})).toBe(0);
  });

  it('baseline: a file may keep its frozen count, and one more line fails', () => {
    scaffold();
    const rel = `${EDITOR}/banner.tsx`;
    write(rel, "const a = 'Your site stays online';\n");
    expect(checkPageStateCopy(base, { [rel]: 1 })).toBe(0);

    write(rel, "const a = 'Your site stays online';\nconst b = 'Search engines will index it';\n");
    expect(checkPageStateCopy(base, { [rel]: 1 })).toBe(1);
    expect(errors()).toContain(`${rel}: 2 page-visibility claims, ceiling 1`);
  });

  it('REFUSES (2) when a scan root is missing', () => {
    scaffold();
    rmSync(join(base, 'apps/web/src/lib/site-editor'), { recursive: true });
    expect(checkPageStateCopy(base, {})).toBe(2);
    expect(errors()).toContain('apps/web/src/lib/site-editor');
  });

  it('REFUSES (2) when the roots hold no .ts/.tsx file', () => {
    for (const root of SCAN_ROOTS) write(`${root}/README.md`, 'Visitors can see this page.\n');
    expect(checkPageStateCopy(base, {})).toBe(2);
  });
});
