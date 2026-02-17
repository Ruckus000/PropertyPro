import { describe, it, expect } from 'vitest';
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  detectFileTypeFromBytes,
  validateFile,
} from '../../src/lib/utils/file-validation';

function bytesFromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('p1-12 magic bytes validation', () => {
  it('recognizes and validates a PDF (%PDF- header)', async () => {
    const header = new TextEncoder().encode('%PDF-');
    const detected = await detectFileTypeFromBytes(header);
    expect(detected?.ext).toBe('pdf');

    const result = await validateFile(header, 1024);
    expect(result.ok).toBe(true);
    expect(result.type?.mime).toBe('application/pdf');
  });

  it('rejects spoofed .pdf when magic bytes do not match (EXE MZ header)', async () => {
    // Windows PE/EXE typically starts with 'MZ' (4D 5A)
    const header = bytesFromHex('4D5A');
    const result = await validateFile(header, 2048);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unrecognized|unsupported|not allowed/i);
  });

  it('rejects zero-byte files gracefully', async () => {
    const header = new Uint8Array(0);
    const result = await validateFile(header, 0);
    expect(result.ok).toBe(false);
  });

  it('accepts a PDF exactly at the 50MB document limit', async () => {
    const header = new TextEncoder().encode('%PDF-');
    const result = await validateFile(header, MAX_DOCUMENT_BYTES);
    expect(result.ok).toBe(true);
  });

  it('rejects a PDF at 50MB + 1 byte', async () => {
    const header = new TextEncoder().encode('%PDF-');
    const result = await validateFile(header, MAX_DOCUMENT_BYTES + 1);
    expect(result.ok).toBe(false);
  });

  it('recognizes PNG magic bytes and enforces 10MB image limit', async () => {
    const pngBytes = bytesFromHex(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6360000000020001E221BC330000000049454E44AE426082',
    );
    const detected = await detectFileTypeFromBytes(pngBytes);
    expect(detected?.ext).toBe('png');

    const withinLimit = await validateFile(pngBytes, MAX_IMAGE_BYTES);
    expect(withinLimit.ok).toBe(true);

    const overLimit = await validateFile(pngBytes, MAX_IMAGE_BYTES + 1);
    expect(overLimit.ok).toBe(false);
  });

  it('recognizes JPG magic bytes', async () => {
    const header = bytesFromHex('FFD8FF');
    const detected = await detectFileTypeFromBytes(header);
    expect(detected?.ext).toBe('jpg');

    const result = await validateFile(header, 1234);
    expect(result.ok).toBe(true);
  });

  it('recognizes DOCX bytes via ZIP container detection', async () => {
    const fileName = new TextEncoder().encode('[Content_Types].xml');
    const zipLocalHeader = bytesFromHex(
      '504B03041400000000000000000000000000000000000000000013000000',
    );
    const docxBytes = concatBytes(
      zipLocalHeader,
      fileName,
      new TextEncoder().encode('word/document.xml'),
    );
    const detected = await detectFileTypeFromBytes(docxBytes);
    expect(detected?.ext).toBe('docx');

    const result = await validateFile(docxBytes, 4096);
    expect(result.ok).toBe(true);
  });

  it('rejects generic ZIP containers that are not DOCX', async () => {
    const zipLocalHeader = bytesFromHex(
      '504B03041400000000000000000000000000000000000000000013000000',
    );
    const genericZip = concatBytes(
      zipLocalHeader,
      new TextEncoder().encode('META-INF/MANIFEST.MF'),
    );
    const detected = await detectFileTypeFromBytes(genericZip);
    expect(detected).toBeNull();

    const result = await validateFile(genericZip, 4096);
    expect(result.ok).toBe(false);
  });
});
