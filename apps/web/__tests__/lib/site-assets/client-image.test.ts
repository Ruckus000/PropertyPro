import { describe, it, expect } from 'vitest';
import {
  validateImageFile,
  validateMinDimensions,
  HERO_MAX_BYTES,
  HERO_MIN_WIDTH,
  HERO_MIN_HEIGHT,
} from '@/lib/site-assets/client-image';

describe('validateImageFile', () => {
  it('accepts JPEG/PNG/WebP within the size cap', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateImageFile({ type, size: 1024 }, { maxBytes: HERO_MAX_BYTES })).toBeNull();
    }
  });

  it('rejects a disallowed MIME type', () => {
    const err = validateImageFile({ type: 'image/gif', size: 1024 }, { maxBytes: HERO_MAX_BYTES });
    expect(err?.code).toBe('mime');
    expect(err?.message).toMatch(/JPEG, PNG, or WebP/i);
  });

  it('rejects a file over the size cap with MB detail', () => {
    const err = validateImageFile(
      { type: 'image/png', size: HERO_MAX_BYTES + 1 },
      { maxBytes: HERO_MAX_BYTES },
    );
    expect(err?.code).toBe('size');
    expect(err?.message).toMatch(/too large/i);
    expect(err?.message).toMatch(/Max 10MB/);
  });

  it('checks MIME before size (mime wins when both invalid)', () => {
    const err = validateImageFile(
      { type: 'application/pdf', size: HERO_MAX_BYTES + 1 },
      { maxBytes: HERO_MAX_BYTES },
    );
    expect(err?.code).toBe('mime');
  });
});

describe('validateMinDimensions', () => {
  const min = { width: HERO_MIN_WIDTH, height: HERO_MIN_HEIGHT };

  it('accepts dimensions at or above the minimum', () => {
    expect(validateMinDimensions({ width: 1600, height: 900 }, min)).toBeNull();
    expect(validateMinDimensions({ width: 1920, height: 1080 }, min)).toBeNull();
  });

  it('rejects when width is too small, stating actual vs required', () => {
    const err = validateMinDimensions({ width: 800, height: 900 }, min);
    expect(err?.code).toBe('dimensions');
    expect(err?.message).toBe('Your image is 800×900, we need at least 1600×900.');
  });

  it('rejects when height is too small', () => {
    const err = validateMinDimensions({ width: 1600, height: 450 }, min);
    expect(err?.code).toBe('dimensions');
    expect(err?.message).toBe('Your image is 1600×450, we need at least 1600×900.');
  });
});
