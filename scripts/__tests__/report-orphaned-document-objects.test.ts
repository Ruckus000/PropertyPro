import { describe, expect, it } from 'vitest';
import {
  analyzeOrphans,
  classifyObjectPath,
  parseReportArgs,
  referencePathsQuery,
  type AnalyzeOrphansInput,
} from '../lib/document-object-orphans';

/**
 * Extract the literal SQL text from a drizzle `sql` template object.
 *
 * Needed because the properties that make this script safe live in the SQL, not
 * in the analysis: the `documents` reference query must NOT filter on
 * `deleted_at` (a soft-deleted document's object is not an orphan), and the
 * e-sign and branding sources must be present at all. `analyzeOrphans` takes
 * rows, so it can never observe any of that — only the query text can.
 *
 * The extractor SELF-TESTS before any assertion trusts it: every case below
 * asserts a known-present marker first. Drizzle's chunk shape is an internal,
 * and an extractor that silently returned `''` would make every `toContain`
 * here fail loudly but every `not.toContain` pass vacuously — the exact shape
 * of green-but-meaningless that `.claude/rules/verification.md` exists to stop.
 */
function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return '';
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) return value.join('');
      if (typeof value === 'string') return value;
      return '';
    })
    .join('');
}

const NOW = new Date('2026-09-14T00:00:00Z');
const OLD = new Date('2026-01-01T00:00:00Z');
const JUST_NOW = new Date('2026-09-13T23:00:00Z');

function analyze(input: Partial<AnalyzeOrphansInput>) {
  return analyzeOrphans({
    objects: [],
    communities: [{ id: 1, slug: 'sunset-condos' }],
    references: [],
    now: NOW,
    ...input,
  });
}

describe('classifyObjectPath', () => {
  it.each([
    ['communities/42/documents/abc-uuid/minutes.pdf', 'document-or-branding-raw', 42],
    ['communities/42/branding/logo.webp', 'branding-canonical', 42],
    ['communities/42/esign-templates/uuid-lease.pdf', 'esign-template', 42],
    ['communities/42/esign-signed/7/signed.pdf', 'esign-signed', 42],
    ['authored-assets/42/9/image.webp', 'authored-asset', 42],
    ['transparency/sunset-condos/718_bylaws.pdf', 'seed-or-legacy', null],
    ['demo/1/thing/file.pdf', 'seed-or-legacy', null],
  ])('classifies %s as %s', (path, kind, communityId) => {
    expect(classifyObjectPath(path)).toEqual({ kind, communityId });
  });

  it('treats an unknown shape under communities/ as seed-or-legacy, not its own error state', () => {
    expect(classifyObjectPath('communities/42/something-new/x.pdf')).toEqual({
      kind: 'seed-or-legacy',
      communityId: 42,
    });
  });
});

describe('the reference query', () => {
  it('does NOT filter soft-deleted documents out', () => {
    const text = sqlText(referencePathsQuery());
    // Self-test the extractor first — see the note on sqlText.
    expect(text).toContain('FROM documents');
    // A soft-deleted document's row still describes its object and the board can
    // restore it. Adding `deleted_at IS NULL` here would make this script
    // recommend deleting the bytes of everything in the Deleted column.
    expect(text).not.toContain('deleted_at');
  });

  it('covers all six writers, not just documents.file_path', () => {
    const text = sqlText(referencePathsQuery());
    expect(text).toContain('FROM documents');
    // Measured against production: the naive documents-only model reported 13
    // live e-sign artifacts as orphans.
    expect(text).toContain('esign_templates');
    expect(text).toContain('esign_submissions');
    expect(text).toContain('signed_document_path');
    expect(text).toContain('audit_certificate_path');
    expect(text).toContain("branding ->> 'logoPath'");
    expect(text).toContain("branding ->> 'siteLogoPath'");
    expect(text).toContain('logo_path');
  });
});

describe('analyzeOrphans', () => {
  it('counts a referenced object as referenced and an unreferenced one as an orphan', () => {
    const result = analyze({
      objects: [
        { name: 'communities/1/documents/aaa/live.pdf', bytes: 100, created_at: OLD },
        { name: 'communities/1/documents/bbb/stranded.pdf', bytes: 250, created_at: OLD },
      ],
      references: [{ path: 'communities/1/documents/aaa/live.pdf' }],
    });

    expect(result.referencedObjects).toBe(1);
    expect(result.orphanCount).toBe(1);
    expect(result.orphanBytes).toBe(250);
    expect(result.groups[0]?.orphans[0]?.path).toBe('communities/1/documents/bbb/stranded.pdf');
    expect(result.groups[0]?.slug).toBe('sunset-condos');
    expect(result.groups[0]?.orphans[0]?.kind).toBe('document-or-branding-raw');
  });

  it('never counts an authored-asset as an orphan, even when nothing references it', () => {
    const result = analyze({
      objects: [{ name: 'authored-assets/1/9/pasted.webp', bytes: 900, created_at: OLD }],
    });

    expect(result.orphanCount).toBe(0);
    expect(result.unmodelledObjects).toBe(1);
    expect(result.unmodelledBytes).toBe(900);
  });

  it('skips objects newer than the cutoff so a mid-flight upload is not called an orphan', () => {
    const result = analyze({
      objects: [
        { name: 'communities/1/documents/ddd/in-flight.pdf', bytes: 1, created_at: JUST_NOW },
      ],
    });

    expect(result.orphanCount).toBe(0);
    expect(result.tooNewObjects).toBe(1);
  });

  it('flags a community whose row is gone, because the FK cascade is a different cause', () => {
    const result = analyze({
      objects: [{ name: 'communities/999/documents/eee/left.pdf', bytes: 42, created_at: OLD }],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.communityRowMissing).toBe(true);
    expect(result.groups[0]?.slug).toBeNull();
  });

  it('does not flag a soft-deleted community as having a missing row', () => {
    // The communities query has no deleted_at filter precisely so this holds:
    // claiming a hard delete that did not happen would point at the wrong cause.
    const result = analyze({
      objects: [{ name: 'communities/1/documents/fff/x.pdf', bytes: 1, created_at: OLD }],
      communities: [{ id: 1, slug: 'soft-deleted-community' }],
    });

    expect(result.groups[0]?.communityRowMissing).toBe(false);
    expect(result.groups[0]?.slug).toBe('soft-deleted-community');
  });

  it('refuses to report success when the bucket returns zero objects', () => {
    expect(() => analyze({ objects: [] })).toThrow(/examined nothing/);
  });

  it('refuses to report success when zero communities are returned', () => {
    expect(() =>
      analyze({
        objects: [{ name: 'communities/1/documents/x/y.pdf', bytes: 1, created_at: OLD }],
        communities: [],
      }),
    ).toThrow(/zero communities/);
  });
});

describe('parseReportArgs', () => {
  it('parses the equals form', () => {
    expect(parseReportArgs(['--max-age-hours=48'])).toEqual({ asJson: false, maxAgeHours: 48 });
  });

  it('parses the SPACE form, which used to be silently ignored', () => {
    // `--max-age-hours 720` previously matched nothing, fell back to the 24h
    // default, and over-reported recent uploads as orphans.
    expect(parseReportArgs(['--max-age-hours', '720'])).toEqual({
      asJson: false,
      maxAgeHours: 720,
    });
  });

  it('parses --json, alone and alongside a value flag', () => {
    expect(parseReportArgs(['--json'])).toEqual({ asJson: true });
    expect(parseReportArgs(['--json', '--max-age-hours=1'])).toEqual({
      asJson: true,
      maxAgeHours: 1,
    });
  });

  it('THROWS on a mistyped flag instead of silently using the default', () => {
    // The whole point: a safety setting you can turn off with a typo is not a
    // safety setting, and this report is what a destructive decision is based on.
    expect(() => parseReportArgs(['--max-age-hourz=720'])).toThrow(/unrecognised argument/);
  });

  it('throws on a stray positional argument', () => {
    expect(() => parseReportArgs(['--delete'])).toThrow(/unrecognised argument/);
    expect(() => parseReportArgs(['48'])).toThrow(/unrecognised argument/);
  });

  it('throws on a non-numeric or negative value, in either form', () => {
    expect(() => parseReportArgs(['--max-age-hours=none'])).toThrow(/non-negative number/);
    expect(() => parseReportArgs(['--max-age-hours', '-1'])).toThrow(/non-negative number/);
    expect(() => parseReportArgs(['--max-age-hours'])).toThrow(/needs a value/);
  });

  it('defaults to no flags', () => {
    expect(parseReportArgs([])).toEqual({ asJson: false });
  });
});
