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
