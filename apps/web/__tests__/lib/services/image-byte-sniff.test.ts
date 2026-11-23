/**
 * The website-image finalize routes (finalize, finalize-favicon,
 * finalize-share-image) hand the raw upload to sharp through three shared
 * functions. The presign route checks only the DECLARED MIME type, so each
 * entry point must sniff the real bytes and refuse anything that is not a PNG,
 * JPEG or WebP before sharp ever sees it — with a 400 ValidationError, not a
 * sharp-thrown 500.
 *
 * sharp is mocked so the test can assert it was never called; `file-type` is
 * real, so the sniff runs against real magic bytes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sharpMock } = vi.hoisted(() => {
  const chain = {
    metadata: vi.fn().mockResolvedValue({ width: 10, height: 10 }),
    extract: vi.fn(),
    resize: vi.fn(),
    rotate: vi.fn(),
    webp: vi.fn(),
    png: vi.fn(),
    jpeg: vi.fn(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('out')),
  };
  for (const k of ['extract', 'resize', 'rotate', 'webp', 'png', 'jpeg'] as const) {
    chain[k].mockReturnValue(chain);
  }
  return { sharpMock: vi.fn(() => chain) };
});

vi.mock('sharp', () => ({ default: sharpMock }));

import { ValidationError } from '@/lib/api/errors';
import { resizeFavicon, resizeShareImage } from '@/lib/services/image-processor';
import { transformSiteImage } from '@/lib/site-assets/transform';

const SVG = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
);

// The 8-byte PNG signature plus an IHDR chunk header: enough for file-type.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);

// A 1x1 animated PNG (acTL before IDAT): file-type reports image/apng.
const APNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000086163544c0000000100000000b42de9a00000000b49444154789c6360000200000500017a5eab3f0000000049454e44ae426082',
  'hex',
);

// A PNG signature cut off mid-header: file-type throws EndOfStreamError on it.
const TRUNCATED_PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');

const entryPoints = [
  ['transformSiteImage', (b: Buffer) => transformSiteImage(b)],
  ['transformSiteImage with a crop', (b: Buffer) =>
    transformSiteImage(b, { x: 0, y: 0, width: 1, height: 1 })],
  ['resizeFavicon', (b: Buffer) => resizeFavicon(b)],
  ['resizeShareImage', (b: Buffer) => resizeShareImage(b)],
] as const;

describe('site image byte sniff', () => {
  beforeEach(() => {
    sharpMock.mockClear();
  });

  describe.each(entryPoints)('%s', (_name, run) => {
    it('SVG bytes labelled png are refused before sharp', async () => {
      const err = await run(SVG).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).statusCode).toBe(400);
      expect(sharpMock).not.toHaveBeenCalled();
    });

    it('bytes with no recognisable type are refused before sharp', async () => {
      const err = await run(Buffer.from('not an image at all')).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(sharpMock).not.toHaveBeenCalled();
    });

    it('truncated bytes are a 400, not a thrown sniffer error', async () => {
      const err = await run(TRUNCATED_PNG).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(sharpMock).not.toHaveBeenCalled();
    });

    it('an animated PNG is a PNG and reaches sharp', async () => {
      await run(APNG);
      expect(sharpMock).toHaveBeenCalled();
    });

    it('real PNG bytes reach sharp', async () => {
      await run(PNG);
      expect(sharpMock).toHaveBeenCalled();
    });
  });
});
