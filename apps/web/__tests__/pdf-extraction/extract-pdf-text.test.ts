import { describe, expect, it } from 'vitest';
import { extractPdfText } from '../../src/lib/utils/extract-pdf-text';

function makeSimplePdf(text: string): Uint8Array {
  const content = `%PDF-1.4\nBT (${text}) Tj ET\n%%EOF`;
  return new TextEncoder().encode(content);
}

describe('extractPdfText', () => {
  it('extracts text from a simple PDF content stream', async () => {
    const buf = makeSimplePdf('Hello PropertyPro');
    const out = await extractPdfText(buf);
    expect(out).toContain('Hello PropertyPro');
  });

  it('handles corrupt/non-PDF input gracefully', async () => {
    const buf = new TextEncoder().encode('not a pdf at all');
    const out = await extractPdfText(buf);
    expect(out).toBe('');
  });

  it('processes large files without crashing', async () => {
    const header = makeSimplePdf('Large File');
    const big = new Uint8Array(10 * 1024 * 1024); // 10MB
    big.set(header, 0);
    const out = await extractPdfText(big);
    // Fallback parser should still find our text near the start
    expect(out).toContain('Large File');
  });
});

