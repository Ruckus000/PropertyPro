import { describe, expect, it } from 'vitest';
import {
  generateViolationNoticePdf,
  generateHearingNoticePdf,
  type ViolationNoticePayload,
  type HearingNoticePayload,
} from '../../src/lib/utils/violation-notice-pdf';

const BASE_NOTICE: ViolationNoticePayload = {
  violationId: 42,
  communityName: 'Sunset Condos',
  communityAddress: '123 Ocean Drive, Miami, FL 33139',
  unitNumber: '204',
  ownerName: 'Jane Doe',
  category: 'noise',
  description: 'Excessive noise after quiet hours (10pm-8am).',
  severity: 'moderate',
  reportedDate: '2026-03-10',
  noticeDate: '2026-03-12',
  curePeriodDays: 14,
  timeZone: 'America/New_York',
};

const BASE_HEARING: HearingNoticePayload = {
  violationId: 42,
  communityName: 'Sunset Condos',
  communityAddress: '123 Ocean Drive, Miami, FL 33139',
  unitNumber: '204',
  ownerName: 'Jane Doe',
  category: 'noise',
  description: 'Excessive noise after quiet hours (10pm-8am).',
  hearingDate: '2026-04-01',
  hearingLocation: 'Community Room A',
  noticeDate: '2026-03-14',
  fineCaps: { perFineCents: 100_00, aggregateCents: 1_000_00 },
  timeZone: 'America/New_York',
};

describe('generateViolationNoticePdf', () => {
  it('returns a valid PDF byte array', () => {
    const result = generateViolationNoticePdf(BASE_NOTICE);
    expect(result.constructor.name).toBe('Uint8Array');
    expect(result.length).toBeGreaterThan(0);

    // Check PDF header
    const header = new TextDecoder().decode(result.slice(0, 9));
    expect(header).toBe('%PDF-1.4\n');
  });

  it('contains the community name and violation ID', () => {
    const result = generateViolationNoticePdf(BASE_NOTICE);
    const text = new TextDecoder().decode(result);
    expect(text).toContain('Sunset Condos');
    expect(text).toContain('#42');
  });

  it('defaults owner name when null', () => {
    const result = generateViolationNoticePdf({ ...BASE_NOTICE, ownerName: null });
    const text = new TextDecoder().decode(result);
    expect(text).toContain('Unit Owner/Resident');
  });

  it('handles very long descriptions without throwing', () => {
    const longDesc = 'A'.repeat(4000);
    const result = generateViolationNoticePdf({ ...BASE_NOTICE, description: longDesc });
    expect(result.constructor.name).toBe('Uint8Array');
    expect(result.length).toBeGreaterThan(0);
  });

  it('escapes PDF special characters in description', () => {
    const result = generateViolationNoticePdf({
      ...BASE_NOTICE,
      description: 'Test with (parentheses) and \\backslash',
    });
    const text = new TextDecoder().decode(result);
    // Parentheses and backslashes should be escaped in the PDF stream
    expect(text).toContain('\\(parentheses\\)');
    expect(text).toContain('\\\\backslash');
  });

  it('includes hearing date when provided', () => {
    const result = generateViolationNoticePdf({
      ...BASE_NOTICE,
      // 10am Eastern. This used `new Date(2026, 3, 1)` (midnight in the TEST
      // runner's zone), which only read as April 1 while dates were formatted
      // in the server's zone; they now format in the community's.
      hearingDate: new Date('2026-04-01T14:00:00Z'),
    });
    const text = new TextDecoder().decode(result);
    expect(text).toContain('April 1, 2026');
  });

  it('includes cure period information', () => {
    const result = generateViolationNoticePdf({ ...BASE_NOTICE, curePeriodDays: 30 });
    const text = new TextDecoder().decode(result);
    expect(text).toContain('30');
  });
});

describe('generateHearingNoticePdf', () => {
  it('returns a valid PDF byte array', () => {
    const result = generateHearingNoticePdf(BASE_HEARING);
    expect(result.constructor.name).toBe('Uint8Array');
    const header = new TextDecoder().decode(result.slice(0, 9));
    expect(header).toBe('%PDF-1.4\n');
  });

  it('contains hearing-specific content', () => {
    const result = generateHearingNoticePdf(BASE_HEARING);
    const text = new TextDecoder().decode(result);
    expect(text).toContain('NOTICE OF HEARING');
    expect(text).toContain('Community Room A');
  });

  it('defaults owner name when null', () => {
    const result = generateHearingNoticePdf({ ...BASE_HEARING, ownerName: null });
    const text = new TextDecoder().decode(result);
    expect(text).toContain('Unit Owner/Resident');
  });

  it('handles null hearing location', () => {
    const result = generateHearingNoticePdf({ ...BASE_HEARING, hearingLocation: null });
    expect(result.constructor.name).toBe('Uint8Array');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// F-05 / F-04 — the notice must not speak as a lawyer, or name the wrong body
// ===========================================================================

/**
 * Generated notices are the sharpest UPL edge in the product: the document
 * addresses an owner by name, cites statutes, asserts a violation occurred, and
 * used to enumerate the reader's legal rights and certify the association's
 * statutory compliance. These tests pin the three corrections, all of which are
 * about what the document CLAIMS rather than how it looks.
 */
function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('generated notices — DRAFT marking', () => {
  it.each([
    ['violation notice', () => generateViolationNoticePdf(BASE_NOTICE)],
    ['hearing notice', () => generateHearingNoticePdf(BASE_HEARING)],
  ])('%s opens with the DRAFT banner', (_label, generate) => {
    const text = textOf(generate());
    expect(text).toContain('DRAFT');
    expect(text).toContain('FOR REVIEW BY THE ASSOCIATION AND ITS COUNSEL');
  });

  it.each([
    ['violation notice', () => generateViolationNoticePdf(BASE_NOTICE)],
    ['hearing notice', () => generateHearingNoticePdf(BASE_HEARING)],
  ])('%s says it has not been reviewed by an attorney', (_label, generate) => {
    expect(textOf(generate())).toContain('has not been reviewed by an attorney');
  });

  it.each([
    ['violation notice', () => generateViolationNoticePdf(BASE_NOTICE)],
    ['hearing notice', () => generateHearingNoticePdf(BASE_HEARING)],
  ])('%s does NOT sign itself on the board\u2019s behalf', (_label, generate) => {
    // The old signature block read "Board of Directors". Software must not sign
    // a legal notice for a body it is not.
    const text = textOf(generate());
    expect(text).not.toContain('Board of Directors');
    expect(text).toContain('Authorized representative');
  });
});

describe('hearing notice — no compliance conclusion', () => {
  it('states the interval rather than certifying compliance', () => {
    // The old text read "in compliance with the required 14-day advance notice
    // period" — the software certifying the association's statutory compliance,
    // which the project's own florida-compliance rule forbids and which is
    // wrong wherever the governing documents require more.
    const text = textOf(generateHearingNoticePdf(BASE_HEARING));

    expect(text).not.toContain('in compliance with the required');
    expect(text).toContain('days before the scheduled hearing');
  });

  it('still flags a SHORT notice prominently', () => {
    // Softening the compliant case must not soften the warning — a board about
    // to send an inadequate notice needs to see it.
    const text = textOf(
      generateHearingNoticePdf({
        ...BASE_HEARING,
        noticeDate: '2026-03-28',
        hearingDate: '2026-04-01',
      }),
    );

    expect(text).toContain('fewer than 14 days');
    expect(text).toContain('Verify before sending');
  });

  it('does not enumerate the reader\u2019s rights as fact', () => {
    // Telling an owner what Florida law entitles them to is advice about their
    // own position, and wrong in any association whose documents differ.
    // Covers BOTH documents: this case used to sit under the hearing-notice
    // heading while rendering only the violation notice, which is how the
    // hearing notice's four-item rights list survived with the suite green.
    const violation = textOf(generateViolationNoticePdf(BASE_NOTICE));
    expect(violation).not.toContain('You have the right to request a hearing');
    expect(violation).toContain('consult an attorney');

    const hearing = textOf(generateHearingNoticePdf(BASE_HEARING));
    expect(hearing).not.toContain('Your Rights at the Hearing');
    expect(hearing).not.toContain('continuance');
    expect(hearing).toContain('consult an attorney');
  });
});

describe('hearing notice — the fining committee, not the board (F-04)', () => {
  it('does not name the Board as the body that imposes a fine', () => {
    // \u00a7718.303(3) / \u00a7720.305(2) require approval by a committee of members who
    // are not officers, directors, or their relatives. The old text named the
    // Board \u2014 contradicting the same document's own citation two lines below.
    const text = textOf(generateHearingNoticePdf(BASE_HEARING));

    expect(text).not.toContain('The Board may, after considering');
    expect(text).toContain('committee of members who are');
    expect(text).toContain('not officers, directors, or their relatives');
  });

  it('states the default statutory caps for a community with no override', () => {
    const text = textOf(generateHearingNoticePdf(BASE_HEARING));
    expect(text).toContain('$100.00 per violation');
    expect(text).toContain('$1000.00 in aggregate');
  });

  it('states the community\u2019s EFFECTIVE caps, not a hardcoded $100/$1,000', () => {
    // The fine service enforces per-community overrides (resolveFineCaps); a
    // notice that printed the statutory default would tell the owner a cap the
    // association does not apply.
    const text = textOf(
      generateHearingNoticePdf({
        ...BASE_HEARING,
        fineCaps: { perFineCents: 50_00, aggregateCents: 500_00 },
      }),
    );
    expect(text).toContain('$50.00 per violation');
    expect(text).toContain('$500.00 in aggregate');
    expect(text).not.toContain('$100');
    expect(text).not.toContain('$1,000');
  });
});

// ===========================================================================
// What the reader SEES. Every case above decodes the raw bytes, which is how
// both notices shipped rendering only their first line (relative `Td` used
// with absolute coordinates). These read the rendered page with pdfjs.
// ===========================================================================

interface RenderedItem {
  str: string;
  x: number;
  y: number;
  right: number;
}

async function render(bytes: Uint8Array): Promise<{ items: RenderedItem[]; text: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  const items: RenderedItem[] = [];
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let line = '';
    for (const entry of content.items) {
      if (!('transform' in entry)) continue;
      items.push({
        str: entry.str,
        x: entry.transform[4]!,
        y: entry.transform[5]!,
        right: entry.transform[4]! + entry.width,
      });
      line += entry.str;
      if (entry.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
  }
  return { items, text: lines.join('\n') };
}

describe('generated notices — rendered page', () => {
  it.each([
    ['violation notice', () => generateViolationNoticePdf(BASE_NOTICE), 'NOTICE OF VIOLATION'],
    ['hearing notice', () => generateHearingNoticePdf(BASE_HEARING), 'NOTICE OF HEARING'],
  ])('%s: every line lands on the page', async (_label, generate, title) => {
    const { items, text } = await render(generate());
    expect(text).toContain('DRAFT \u2014 FOR REVIEW BY THE ASSOCIATION AND ITS COUNSEL');
    expect(text).toContain('has not been reviewed by an attorney');
    expect(text).toContain(title);
    expect(text).toContain('Authorized representative');
    expect(text).toContain('Unit: 204');
    for (const item of items) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.right).toBeLessThanOrEqual(612);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeLessThanOrEqual(792);
    }
  });

  it('prints the cure date', async () => {
    const { text } = await render(generateViolationNoticePdf(BASE_NOTICE));
    expect(text).toContain('(by March 26, 2026)');
  });

  it('renders accents and smart quotes as typed', async () => {
    const description = '\u201cN\u00fa\u00f1ez\u2019s\u201d dog \u2013 again\u2026';
    const { text } = await render(generateViolationNoticePdf({ ...BASE_NOTICE, description }));
    expect(text).toContain(description);
  });

  it('breaks a word longer than the line instead of running off the page', async () => {
    // W is Helvetica's widest glyph, so a split sized by character count must
    // be sized for it (x is half as wide and would pass a wrong limit).
    const { items, text } = await render(
      generateViolationNoticePdf({ ...BASE_NOTICE, description: 'W'.repeat(200) }),
    );
    expect(text.replace(/\s/g, '')).toContain('W'.repeat(200));
    for (const item of items) expect(item.right).toBeLessThanOrEqual(612 - 54);
  });

  it('prints every WinAnsi glyph, and a C1 control as ?', async () => {
    const { text } = await render(
      generateViolationNoticePdf({ ...BASE_NOTICE, description: 'Fine 50\u20ac \u2122 \u0152uvre \u0080x' }),
    );
    expect(text).toContain('Fine 50\u20ac \u2122 \u0152uvre ?x');
  });

  it('never splits an emoji across lines', async () => {
    const { text } = await render(
      generateViolationNoticePdf({ ...BASE_NOTICE, description: `${'a'.repeat(49)}\u{1F600}b` }),
    );
    // The emoji is one code point: one `?`, not a `?` for each surrogate half.
    expect(text).toContain(`${'a'.repeat(49)}? b`);
  });

  it('declares byte-exact /Length and startxref', () => {
    const bytes = generateViolationNoticePdf({ ...BASE_NOTICE, description: 'Caf\u00e9 \u2014 \u2019' });
    const raw = new TextDecoder('latin1').decode(bytes);
    const stream = /<< \/Length (\d+) >>\nstream\n/.exec(raw)!;
    const start = stream.index + stream[0].length;
    expect(raw.indexOf('\nendstream', start) - start).toBe(Number(stream[1]));
    const startxref = Number(/startxref\n(\d+)/.exec(raw)![1]);
    expect(raw.slice(startxref, startxref + 4)).toBe('xref');
  });
});

describe('hearing notice — time in the community, not UTC', () => {
  // 8:30pm Eastern on March 31 is 00:30 UTC on April 1.
  const EVENING = { ...BASE_HEARING, hearingDate: new Date('2026-04-01T00:30:00Z') };

  it('prints the local date and time', async () => {
    const { text } = await render(generateHearingNoticePdf({ ...EVENING, noticeDate: '2026-03-10' }));
    expect(text).toContain('Date and Time: March 31, 2026 at 8:30 PM');
  });

  it('counts calendar days in the community, so a 13-day notice is flagged', async () => {
    const { text } = await render(generateHearingNoticePdf({ ...EVENING, noticeDate: '2026-03-18' }));
    expect(text).toContain('dated 13 days before the scheduled hearing');
    expect(text).toContain('fewer than 14 days');
  });

  it('a 14-day notice is not flagged', async () => {
    const { text } = await render(generateHearingNoticePdf({ ...EVENING, noticeDate: '2026-03-17' }));
    expect(text).toContain('dated 14 days before the scheduled hearing');
    expect(text).not.toContain('fewer than 14 days');
  });
});
