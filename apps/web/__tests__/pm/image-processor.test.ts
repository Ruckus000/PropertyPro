import { describe, expect, it } from 'vitest';
import { resizeEmailLogo, resizeLogo } from '../../src/lib/services/image-processor';

/**
 * Integration-style tests for the image processor service.
 * Uses a real sharp invocation against a minimal in-memory PNG.
 */
describe('resizeLogo', () => {
  /**
   * Builds a minimal 1×1 red PNG buffer using raw bytes.
   * This is a valid PNG without requiring any test fixture files.
   */
  async function makeMinimalPng(): Promise<Buffer> {
    // Use sharp itself to create a 1×1 red test image
    const sharp = await import('sharp');
    return sharp
      .default({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png()
      .toBuffer();
  }

  it('returns a Buffer', async () => {
    const input = await makeMinimalPng();
    const result = await resizeLogo(input);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('output is valid WebP (starts with RIFF....WEBP magic bytes)', async () => {
    const input = await makeMinimalPng();
    const result = await resizeLogo(input);
    // WebP: bytes 0-3 = "RIFF", bytes 8-11 = "WEBP"
    expect(result.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(result.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('output dimensions are 400×400', async () => {
    const input = await makeMinimalPng();
    const result = await resizeLogo(input);
    const sharp = await import('sharp');
    const meta = await sharp.default(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });
});

describe('resizeEmailLogo', () => {
  it('is a 96x96 PNG, since Outlook desktop does not render WebP', async () => {
    const sharp = await import('sharp');
    const input = await sharp
      .default({ create: { width: 300, height: 120, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .png()
      .toBuffer();

    const meta = await sharp.default(await resizeEmailLogo(input)).metadata();

    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([96, 96]);
  });
});
