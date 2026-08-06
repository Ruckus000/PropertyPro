import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLayoutMetadata } from '@/lib/site-templates/update-layout';

const LAYOUT = {
  id: 1,
  slug: 'boulevard',
  displayName: 'Boulevard',
  tagline: 'Mid-century Floridian',
  description: null,
  tier: 'professional' as const,
  isArchived: false,
  isFeatured: true,
  defaultPresetSlug: 'palm-shadow',
  version: '1.0.0',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-29T00:00:00Z',
};

describe('saveLayoutMetadata', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('PATCHes the slug with the patch body and returns the shaped layout', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ layout: LAYOUT }) } as Response);

    const result = await saveLayoutMetadata('boulevard', { tier: 'professional', isFeatured: true });

    expect(result).toEqual(LAYOUT);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/site-templates/layouts/boulevard');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tier: 'professional',
      isFeatured: true,
    });
  });

  it('encodes the slug in the URL', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ layout: LAYOUT }) } as Response);
    await saveLayoutMetadata('a/b', { isArchived: true });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/site-templates/layouts/a%2Fb');
  });

  it('throws the server error message on a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Layout not found: nope' } }),
    } as Response);
    await expect(saveLayoutMetadata('nope', { isFeatured: false })).rejects.toThrow(
      'Layout not found: nope',
    );
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);
    await expect(saveLayoutMetadata('boulevard', { isFeatured: false })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});
