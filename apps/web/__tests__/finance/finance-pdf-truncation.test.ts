/**
 * A cut statement must not look complete on paper (roadmap 3.8): when
 * `truncated` is set, both statement PDFs print a note under the balance.
 */
import { describe, expect, it } from 'vitest';
import {
  generateCommunityFinanceStatementPdf,
  generateFinanceStatementPdf,
} from '../../src/lib/utils/finance-pdf';

const NOTE = 'NOTE: Some items are omitted from Payables';
const item = { dueDate: '2026-03-01', status: 'pending', amountCents: 100, lateFeeCents: 0 };

function text(pdf: Uint8Array): string {
  return new TextDecoder().decode(pdf);
}

describe('statement PDF truncation note', () => {
  it.each([true, false])('unit statement: truncated=%s', (truncated) => {
    const pdf = generateFinanceStatementPdf({
      unitId: 7,
      balanceCents: 0,
      ledgerEntries: [],
      lineItems: [item],
      truncated,
    });
    expect(text(pdf).includes(NOTE)).toBe(truncated);
  });

  it.each([true, false])('community statement: truncated=%s', (truncated) => {
    const pdf = generateCommunityFinanceStatementPdf({
      communityId: 11,
      balanceCents: 0,
      ledgerEntries: [],
      lineItems: [{ ...item, unitNumber: '101' }],
      truncated,
    });
    expect(text(pdf).includes(NOTE)).toBe(truncated);
  });
});
