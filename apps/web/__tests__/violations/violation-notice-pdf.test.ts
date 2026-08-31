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
      hearingDate: new Date(2026, 3, 1), // April 1, 2026 (month is 0-indexed)
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
    const text = textOf(generateViolationNoticePdf(BASE_NOTICE));
    expect(text).not.toContain('You have the right to request a hearing');
    expect(text).toContain('consult an attorney');
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

  it('still cites the statutory caps', () => {
    const text = textOf(generateHearingNoticePdf(BASE_HEARING));
    expect(text).toContain('$100 per');
    expect(text).toContain('$1,000 in aggregate');
  });
});
