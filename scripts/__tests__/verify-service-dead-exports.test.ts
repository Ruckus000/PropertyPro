/**
 * Self-test for `guard:service-dead-exports` (SVC-07).
 *
 * verification.md requires BOTH directions: a guard that cannot pass is as
 * useless as one that cannot fail. These fixtures are the two-direction proof:
 *   - referenced export      → NOT dead (guard must stay green)
 *   - unreferenced export    → dead     (guard must be able to red)
 *   - comment-only mention   → dead     (prose is not a reference)
 * plus the shapes the scan scope excludes (default exports, re-export lines,
 * non-exported functions) and the baseline's shrink-only semantics.
 *
 * Pure in-memory fixtures — the repo-wide scan is main()'s job, not the tests'.
 */
import { describe, it, expect } from 'vitest';
import {
  extractExportedFunctionNames,
  blankComments,
  commentExtractorWorks,
  findDeadExports,
  evaluateBaseline,
  isDefinitionFile,
  type ScannedFile,
} from '../verify-service-dead-exports';

const SERVICE = 'apps/web/src/lib/services/faq-service.ts';

const serviceFile = (body: string): ScannedFile => ({
  path: SERVICE,
  content: body,
});

describe('extractExportedFunctionNames', () => {
  it('collects top-level `export function` and `export async function`', () => {
    const names = extractExportedFunctionNames(
      'svc.ts',
      [
        'export function listFaqs(): number[] { return []; }',
        'export async function getFaq(id: number): Promise<void> { void id; }',
        '',
      ].join('\n'),
    );
    expect(names).toEqual(['listFaqs', 'getFaq']);
  });

  it('skips non-exported functions', () => {
    const names = extractExportedFunctionNames(
      'svc.ts',
      'function internalHelper(): void {}\nexport function kept(): void {}\n',
    );
    expect(names).toEqual(['kept']);
  });

  it('skips `export default function`', () => {
    const names = extractExportedFunctionNames(
      'svc.ts',
      'export default function main(): void {}\nexport function kept(): void {}\n',
    );
    expect(names).toEqual(['kept']);
  });

  it('skips re-export lines (`export { x } from …`)', () => {
    const names = extractExportedFunctionNames(
      'svc.ts',
      "export { other } from './other-service';\nexport function kept(): void {}\n",
    );
    expect(names).toEqual(['kept']);
  });

  it('skips nested functions — only top-level statements count', () => {
    const names = extractExportedFunctionNames(
      'svc.ts',
      'export function outer(): void {\n  function inner(): void {}\n  inner();\n}\n',
    );
    expect(names).toEqual(['outer']);
  });

  it('does NOT collect `export const` arrow functions (documented scope limit)', () => {
    const names = extractExportedFunctionNames(
      'svc.ts',
      'export const doThing = (): void => {};\nexport function kept(): void {}\n',
    );
    expect(names).toEqual(['kept']);
  });

  it('counts an overloaded export ONCE — signatures are one export name', () => {
    // Live shape: help-article-service.ts declares searchArticles three times.
    // Duplicates would inflate the denominator and, if the name ever went dead,
    // emit N identical violations and blow the ceiling for a grandfathered name.
    const names = extractExportedFunctionNames(
      'svc.ts',
      [
        'export function searchArticles(q: string): void;',
        'export function searchArticles(q: string, c: number): void;',
        'export function searchArticles(q: string, c?: number): void { void q; void c; }',
        '',
      ].join('\n'),
    );
    expect(names).toEqual(['searchArticles']);
  });

  it('skips `export declare function` — ambient declarations have no runtime body', () => {
    const names = extractExportedFunctionNames(
      'svc.ts',
      'export declare function phantom(x: string): void;\nexport function kept(): void {}\n',
    );
    expect(names).toEqual(['kept']);
  });

  it('returns null on a parse failure rather than an empty list', () => {
    // An empty list would silently un-scan the file; null makes main() refuse.
    expect(extractExportedFunctionNames('svc.ts', 'export function ((( {')).toBeNull();
  });
});

describe('blankComments', () => {
  it('blanks line comments', () => {
    const out = blankComments('p.ts', '// listFaqs is great\nconst a = 1;\n');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/listFaqs/);
    expect(out).toMatch(/const a = 1;/);
  });

  it('blanks block comments', () => {
    const out = blankComments('p.ts', '/* getFaq\n   orphanFn */\nconst a = 1;\n');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/getFaq|orphanFn/);
    expect(out).toMatch(/const a = 1;/);
  });

  // Regression pin for the review-found leak: comments attach to TOKENS, so a
  // NODE walk misses any comment not adjacent to a node boundary. The live
  // cost was `findOrphanCommunities` — a dead export kept "alive" by a
  // trailing comment inside an array literal in its own unit test.
  it('blanks a trailing comment inside an array literal', () => {
    const out = blankComments('p.ts', 'const x = [\n 1, // leakMe\n];\n');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/leakMe/);
  });

  it('blanks a trailing comment inside call arguments', () => {
    const out = blankComments('p.ts', 'f(\n a, // leakMe\n);\n');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/leakMe/);
  });

  it('blanks a comment inside a nested function body', () => {
    const out = blankComments('p.ts', 'function a() { /* leakMe */ }\n');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/leakMe/);
  });

  it('blanks an end-of-file comment with no following token', () => {
    const out = blankComments('p.ts', 'const a = 1;\n// leakMe at EOF\n');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/leakMe/);
  });

  it('blanks a JSX expression comment in .tsx', () => {
    const out = blankComments('p.tsx', 'export const A = () => <div>{/* leakMe */}<span>x</span></div>;\n');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/leakMe/);
  });

  it('preserves string-literal contents (strings count as references)', () => {
    const out = blankComments('p.ts', 'const s = "// not a comment: listFaqs";\n');
    expect(out).not.toBeNull();
    expect(out).toMatch(/listFaqs/);
  });

  it('preserves line count so positions stay readable', () => {
    const out = blankComments('p.ts', '// c\nconst a = 1;\n');
    expect(out).not.toBeNull();
    expect(out!.split('\n').length).toBe('// c\nconst a = 1;\n'.split('\n').length);
  });

  it('returns null on a parse failure', () => {
    expect(blankComments('p.ts', 'const a = (((;')).toBeNull();
  });
});

describe('commentExtractorWorks — parser self-test', () => {
  it('detects both a parse failure and a found comment range', () => {
    // parseDiagnostics is a TS internal; if it stops being populated, the guard
    // would treat unparseable files as clean. This probe refuses first.
    expect(commentExtractorWorks()).toBe(true);
  });
});

describe('findDeadExports', () => {
  const services: ScannedFile[] = [
    serviceFile(
      [
        'export function listFaqs(): number[] { return []; }',
        'export async function getFaq(id: number): Promise<void> { void id; }',
        'export function orphanFn(): void {}',
        'export function selfOnly(): void { helper(); }',
        'function helper(): void {}',
        '',
      ].join('\n'),
    ),
  ];

  it('an export imported by app code is NOT dead', () => {
    const corpus: ScannedFile[] = [
      {
        path: 'apps/web/src/app/faqs/page.tsx',
        content: "import { listFaqs } from '@/lib/services/faq-service';\nlistFaqs();\n",
      },
    ];
    const { dead } = findDeadExports(services, corpus);
    expect(dead.some((d) => d.name === 'listFaqs')).toBe(false);
  });

  it('an export referenced ONLY by a test file is NOT dead (test-referenced = covered)', () => {
    const corpus: ScannedFile[] = [
      {
        path: 'apps/web/__tests__/faq.test.ts',
        content: "import { getFaq } from '@/lib/services/faq-service';\ngetFaq(1);\n",
      },
    ];
    const { dead } = findDeadExports(services, corpus);
    expect(dead.some((d) => d.name === 'getFaq')).toBe(false);
  });

  it('an export with no reference outside its defining file IS dead', () => {
    const { dead } = findDeadExports(services, []);
    expect(dead).toContainEqual({ file: SERVICE, name: 'orphanFn' });
  });

  it('a comment-only mention is NOT a reference — still dead', () => {
    const corpus: ScannedFile[] = [
      {
        path: 'apps/web/src/app/faqs/page.tsx',
        content: '// orphanFn was the old helper, see the audit\nconst a = 1;\n',
      },
    ];
    const { dead } = findDeadExports(services, corpus);
    expect(dead).toContainEqual({ file: SERVICE, name: 'orphanFn' });
  });

  it('a comment in a NESTED token position is not a reference either', () => {
    // The findOrphanCommunities shape: the only outside mention sits in a
    // trailing comment inside an array literal in a unit test. A node-walk
    // comment collector never sees it and reports the export alive.
    const corpus: ScannedFile[] = [
      {
        path: 'apps/web/__tests__/faq.test.ts',
        content: 'const rows = [\n [], // orphanFn sweep — no orphans\n];\nrows.length;\n',
      },
      {
        path: 'apps/web/src/app/api/v1/watchdog/route.ts',
        content: 'export async function GET(): Promise<void> {\n  // see faq-service.ts:orphanFn\n}\n',
      },
    ];
    const { dead } = findDeadExports(services, corpus);
    expect(dead).toContainEqual({ file: SERVICE, name: 'orphanFn' });
  });

  it('same-file-only usage is still dead — the defining file never references itself', () => {
    const { dead } = findDeadExports(services, []);
    expect(dead).toContainEqual({ file: SERVICE, name: 'selfOnly' });
    expect(dead.some((d) => d.name === 'helper')).toBe(false); // not exported
  });

  it('a string-literal mention counts as a reference (conservative direction)', () => {
    const corpus: ScannedFile[] = [
      {
        path: 'scripts/run-something.ts',
        content: "const jobName = 'orphanFn';\nconsole.log(jobName);\n",
      },
    ];
    const { dead } = findDeadExports(services, corpus);
    expect(dead.some((d) => d.name === 'orphanFn')).toBe(false);
  });

  it('word-boundary matching: a superstring identifier is not a reference', () => {
    const corpus: ScannedFile[] = [
      {
        path: 'apps/web/src/app/page.tsx',
        content: 'const orphanFnExtended = 1;\norphanFnExtended.toString();\n',
      },
    ];
    const { dead } = findDeadExports(services, corpus);
    expect(dead).toContainEqual({ file: SERVICE, name: 'orphanFn' });
  });

  it('service files are union-ed into the corpus, so cross-service references count', () => {
    const otherService: ScannedFile = {
      path: 'apps/web/src/lib/services/help-service.ts',
      content: "import { orphanFn } from './faq-service';\nexport function useIt(): void { orphanFn(); }\n",
    };
    const { dead } = findDeadExports([...services, otherService], []);
    expect(dead.some((d) => d.name === 'orphanFn')).toBe(false);
    // …and the other service's own unreferenced export is still found.
    expect(dead).toContainEqual({
      file: 'apps/web/src/lib/services/help-service.ts',
      name: 'useIt',
    });
  });

  it('THROWS on an unparseable service file — never silently "no exports"', () => {
    // The documented contract: a file that did not parse is could-not-check,
    // not a clean scan. A silent [] would let a mid-refactor file report clean
    // when DC-03 (Phase 3.11) points this scanner at packages/shared.
    const broken: ScannedFile[] = [{ path: SERVICE, content: 'export function ((( {' }];
    expect(() => findDeadExports(broken, [])).toThrow(/did not parse/);
  });

  it('REPORTS an unparseable corpus file instead of silently counting its comments', () => {
    // A broken .mjs (not typechecked in CI) whose only mention of the export
    // is in a comment is an exemption channel: the raw-token fallback keeps
    // the export alive. The function must surface the file so main() refuses.
    const corpus: ScannedFile[] = [
      { path: 'scripts/zz-broken.mjs', content: 'const a = (((;\n// orphanFn mention\n' },
    ];
    const { dead, unparseableCorpusFiles } = findDeadExports(services, corpus);
    expect(unparseableCorpusFiles).toEqual(['scripts/zz-broken.mjs']);
    // Conservative direction while unparseable: raw tokens count as a reference.
    expect(dead.some((d) => d.name === 'orphanFn')).toBe(false);
  });
});

describe('isDefinitionFile — defining-side scan predicate', () => {
  const S = 'apps/web/src/lib/services';

  it('admits plain service modules, including subdirectories', () => {
    expect(isDefinitionFile(`${S}/faq-service.ts`)).toBe(true);
    expect(isDefinitionFile(`${S}/sms/twilio-service.ts`)).toBe(true);
    expect(isDefinitionFile(`${S}/types.tsx`)).toBe(true);
  });

  it('rejects everything outside the services root', () => {
    expect(isDefinitionFile('apps/web/src/lib/utils/foo.ts')).toBe(false);
    expect(isDefinitionFile('packages/shared/src/foo.ts')).toBe(false);
  });

  it('rejects .d.ts files — ambient surfaces are not service definitions', () => {
    expect(isDefinitionFile(`${S}/types.d.ts`)).toBe(false);
    expect(isDefinitionFile(`${S}/deep/nested/augment.d.ts`)).toBe(false);
  });

  it('rejects test files in every colocated shape, not just .test.ts', () => {
    expect(isDefinitionFile(`${S}/__tests__/faq-service.test.ts`)).toBe(false);
    expect(isDefinitionFile(`${S}/faq-service.test.ts`)).toBe(false);
    expect(isDefinitionFile(`${S}/faq-service.spec.ts`)).toBe(false);
    expect(isDefinitionFile(`${S}/deep/foo.test.tsx`)).toBe(false);
    expect(isDefinitionFile(`${S}/deep/foo.spec.js`)).toBe(false);
  });

  it('rejects non-TypeScript extensions on the defining side', () => {
    expect(isDefinitionFile(`${S}/legacy.js`)).toBe(false);
    expect(isDefinitionFile(`${S}/tool.mjs`)).toBe(false);
  });
});

describe('evaluateBaseline — shrink-only semantics', () => {
  const dead = [
    { file: SERVICE, name: 'orphanFn' },
    { file: SERVICE, name: 'selfOnly' },
  ];

  it('a dead export NOT in the baseline is a violation', () => {
    const result = evaluateBaseline(dead, { [SERVICE]: ['orphanFn'] });
    expect(result.violations).toEqual([{ file: SERVICE, name: 'selfOnly' }]);
    expect(result.measured).toBe(2);
    expect(result.baselineTotal).toBe(1);
  });

  it('a dead export IN the baseline is not a violation', () => {
    const result = evaluateBaseline(dead, { [SERVICE]: ['orphanFn', 'selfOnly'] });
    expect(result.violations).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('a baseline entry that is no longer dead is reported stale (ratchet down)', () => {
    const result = evaluateBaseline([dead[0]!], { [SERVICE]: ['orphanFn', 'fixedFn'] });
    expect(result.violations).toEqual([]);
    expect(result.stale).toEqual([{ file: SERVICE, name: 'fixedFn' }]);
  });

  it('a new file with dead exports and no baseline entry at all is a violation', () => {
    const result = evaluateBaseline(
      [{ file: 'apps/web/src/lib/services/new-service.ts', name: 'brandNew' }],
      {},
    );
    expect(result.violations).toEqual([
      { file: 'apps/web/src/lib/services/new-service.ts', name: 'brandNew' },
    ]);
    expect(result.baselineTotal).toBe(0);
  });

  it('empty dead list against empty baseline is clean', () => {
    const result = evaluateBaseline([], {});
    expect(result.violations).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.measured).toBe(0);
    expect(result.baselineTotal).toBe(0);
  });
});
