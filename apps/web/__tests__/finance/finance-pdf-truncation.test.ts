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

describe('statement PDF layout', () => {
  it('every line lands on the page (absolute Tm, not relative Td)', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = generateFinanceStatementPdf({
      unitId: 7,
      balanceCents: 0,
      ledgerEntries: [],
      lineItems: Array.from({ length: 3 }, () => item),
    });
    const doc = await pdfjs.getDocument({ data: pdf, useWorkerFetch: false, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const [, , width, height] = page.view as [number, number, number, number];
    const content = await page.getTextContent();
    const ys = content.items
      .filter((entry): entry is typeof entry & { transform: number[] } => 'transform' in entry)
      .map((entry) => ({ x: entry.transform[4]!, y: entry.transform[5]! }));
    // Title, Generated, Balance, header, 3 items, Ledger heading + header: 9 lines.
    expect(new Set(ys.map((p) => p.y)).size).toBeGreaterThanOrEqual(9);
    for (const p of ys) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(height);
    }
  });
});
