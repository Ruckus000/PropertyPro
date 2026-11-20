/**
 * Fixture tests for `guard:console-error-redaction`.
 *
 * Vacuously red is as useless as vacuously green
 * (`.claude/rules/verification.md`), so every "must flag" case has a sibling
 * "must not flag" case that would also break if the scanner stopped working.
 * The parse-detector self-test is included because `parseDiagnostics` is a TS
 * internal that a version bump could quietly remove (the same caveat
 * `guard:legacy-roles` documents).
 */
import { describe, expect, it } from 'vitest';
import {
  EXEMPT,
  isErrorishName,
  scanSource,
} from '../lib/console-error-redaction';

const scan = (src: string, file = 'a.ts') => scanSource(file, src);
const lines = (src: string, file = 'a.ts') => scan(src, file).violations.map((v) => v.line);

describe('flags raw error values reaching console.error/warn', () => {
  it('flags a bare error identifier', () => {
    expect(lines(`console.error('ctx', error);`)).toEqual([1]);
  });

  it('flags error-ish suffix names (inviteError, dbError, otherErr)', () => {
    const src = [
      `console.error('a', inviteError);`,
      `console.error('b', dbError);`,
      `console.error('c', otherErr);`,
    ].join('\n');
    expect(lines(src)).toEqual([1, 2, 3]);
  });

  it('flags console.warn the same way', () => {
    expect(lines(`console.warn('ctx', err);`)).toEqual([1]);
  });

  it('flags ANY property read on an error-ish object, including through `as` casts', () => {
    // Not just .message/.stack: postgres.js carries the value-bearing text in
    // .detail, and DrizzleQueryError exposes .query/.params as own properties.
    const src = [
      'console.error(`failed: ${error.message}`);',
      'console.error("x", (err as Error).stack);',
      'console.error("x", e.cause);',
      'console.error("x", err.detail);',
      'console.error("x", error.fields);',
    ].join('\n');
    expect(lines(src)).toEqual([1, 2, 3, 4, 5]);
  });

  it('flags String(err) and errorish property accesses (parsed.error)', () => {
    const src = [
      `console.error('x', String(err));`,
      `console.error('x', parsed.error);`,
    ].join('\n');
    expect(lines(src)).toEqual([1, 2]);
  });

  it('flags object literals carrying the error, shorthand or not', () => {
    const src = [
      `console.error('x', { communityId, err });`,
      `console.error('x', { jobId: job.id, error: rawError });`,
    ].join('\n');
    expect(lines(src)).toEqual([1, 2]);
  });

  it('flags a multi-line call, reporting the call line', () => {
    const src = [
      `console.error(`,
      `  '[ctx] something failed:',`,
      `  error,`,
      `);`,
    ].join('\n');
    expect(lines(src)).toEqual([1]);
  });

  it('flags String concatenation of the message', () => {
    expect(lines(`console.error('failed: ' + error.message);`)).toEqual([1]);
  });
});

describe('does not flag the allowed shapes', () => {
  it('accepts the formatErrorForLog wrapper', () => {
    expect(lines(`console.error('ctx', formatErrorForLog(error));`)).toEqual([]);
  });

  it('accepts the redactParams wrapper, including inside JSON.stringify', () => {
    const src = [
      `console.error('ctx', redactParams(error.message));`,
      `console.error(JSON.stringify({ event: 'x', error: redactParams(dbError.message) }));`,
    ].join('\n');
    expect(lines(src)).toEqual([]);
  });

  it('accepts static strings and non-error values', () => {
    const src = [
      `console.error('job skipped: nothing to do');`,
      `console.error('x', { jobId: job.id, error: message });`,
      `console.error('counts', claimed, completed);`,
    ].join('\n');
    expect(lines(src)).toEqual([]);
  });

  it('does not descend into callbacks — an arrow parameter named e is not the logged value', () => {
    expect(lines(`console.error('failed ids', list.filter((e) => !e.ok).map((x) => x.id));`)).toEqual([]);
  });

  it('honours the exemption comment on the call line or the argument line', () => {
    const src = [
      `console.error('x', error); // ${EXEMPT} — static vendor string, no values`,
      `console.error(`,
      `  'x',`,
      `  error, // ${EXEMPT} — reason`,
      `);`,
    ].join('\n');
    expect(lines(src)).toEqual([]);
  });

  it('does NOT honour an exemption comment on the line ABOVE (pinned placement semantics)', () => {
    // Same on-line convention as design-tokens:exempt / admin-error-leak:exempt.
    // Pinned so a future "why didn't my exemption fire" has a test to read.
    const src = [`// ${EXEMPT} — reason`, `console.error('x', error);`].join('\n');
    expect(lines(src)).toEqual([2]);
  });

  it('ignores console.log / console.info (out of scope)', () => {
    const src = [`console.info('x', error);`, `console.log('x', err.message);`].join('\n');
    expect(lines(src)).toEqual([]);
  });

  it('skips use client files entirely (browser console never reaches Vercel logs)', () => {
    const src = [`'use client';`, ``, `console.error('x', error);`].join('\n');
    const result = scan(src, 'component.tsx');
    expect(result.isClient).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.sites).toBe(0);
  });

  it('still scans a server file whose first comment mentions use client', () => {
    const src = [`// not a 'use client' file`, `console.error('x', error);`].join('\n');
    expect(lines(src)).toEqual([2]);
  });

  it('skips instrumentation-client.ts by NAME — browser-only without a directive', () => {
    const src = [`/** docblock, no directive */`, `console.error('x', error);`].join('\n');
    expect(scan(src, 'apps/web/src/instrumentation-client.ts').isClient).toBe(true);
    expect(lines(src, 'apps/web/src/instrumentation-client.ts')).toEqual([]);
    // Control: the same source in an ordinary server file IS flagged.
    expect(lines(src, 'apps/web/src/lib/other.ts')).toEqual([2]);
  });
});

describe('scanner integrity', () => {
  it('counts every console.error/warn site as denominator', () => {
    const src = [
      `console.error('static');`,
      `console.warn('static');`,
      `console.error('x', error);`,
      `console.info('x', error);`,
    ].join('\n');
    expect(scan(src).sites).toBe(3);
  });

  it('matches error-ish names by bare name or suffix only', () => {
    expect(isErrorishName('err')).toBe(true);
    expect(isErrorishName('Error')).toBe(true);
    expect(isErrorishName('inviteError')).toBe(true);
    expect(isErrorishName('clearErr')).toBe(true);
    expect(isErrorishName('errorMessage')).toBe(false);
    expect(isErrorishName('message')).toBe(false);
    expect(isErrorishName('userId')).toBe(false);
  });

  it('reports parseFailed on syntactically broken source (the detector itself is the thing under test)', () => {
    // parseDiagnostics is a TS internal; if a version bump removes it, this
    // case goes green-when-it-should-be-red and the guard silently loses its
    // refuse-to-vouch path.
    expect(scan(`console.error('x', ;`).parseFailed).toBe(true);
    expect(scan(`console.error('x', error);`).parseFailed).toBe(false);
  });
});
