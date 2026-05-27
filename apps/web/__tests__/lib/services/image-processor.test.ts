import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { resizeSiteImage } from '@/lib/services/image-processor';

async function makeJpegFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 100, b: 50 } },
  }).jpeg().toBuffer();
}

describe('resizeSiteImage', () => {
  it('produces two WebP variants: 1600w and 800w', async () => {
    const input = await makeJpegFixture(2400, 1350);
    const result = await resizeSiteImage(input);

    const meta1600 = await sharp(result.at1600w).metadata();
    expect(meta1600.format).toBe('webp');
    expect(meta1600.width).toBe(1600);

    const meta800 = await sharp(result.at800w).metadata();
    expect(meta800.format).toBe('webp');
    expect(meta800.width).toBe(800);
  });

  it('preserves aspect ratio', async () => {
    const input = await makeJpegFixture(1600, 900);
    const result = await resizeSiteImage(input);
    const meta = await sharp(result.at1600w).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });

  it('does not upscale: input smaller than 1600w stays at original width', async () => {
    const input = await makeJpegFixture(1200, 675);
    const result = await resizeSiteImage(input);
    const meta = await sharp(result.at1600w).metadata();
    expect(meta.width).toBe(1200);
  });

  it('strips EXIF / metadata in the output', async () => {
    const input = await makeJpegFixture(2000, 1125);
    const result = await resizeSiteImage(input);
    const meta = await sharp(result.at1600w).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
