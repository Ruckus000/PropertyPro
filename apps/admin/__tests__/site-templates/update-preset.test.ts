import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveThemePreset } from '@/lib/site-templates/update-preset';

const PRESET = {
  id: 1,
  slug: 'bay-light',
  displayName: 'Bay Light',
  description: 'Tidewater default',
  tokens: {
    primaryColor: '#0e3338',
    secondaryColor: '#f6f1e6',
    accentColor: '#c66f49',
    headingFont: 'Fraunces',
    bodyFont: 'Manrope',
  },
  tier: 'essentials' as const,
  isArchived: false,
  isFeatured: true,
  version: 2,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-29T00:00:00Z',
};

describe('saveThemePreset', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PATCHes the slug with the patch body and returns the shaped preset', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ preset: PRESET }) } as Response);

    const result = await saveThemePreset('bay-light', { displayName: 'Bay Light', isFeatured: true });

    expect(result).toEqual(PRESET);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/site-templates/theme-presets/bay-light');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      displayName: 'Bay Light',
      isFeatured: true,
    });
  });

  it('throws the server error message on a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Theme preset not found: nope' } }),
    } as Response);
    await expect(saveThemePreset('nope', { isFeatured: false })).rejects.toThrow(
      'Theme preset not found: nope',
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
    await expect(saveThemePreset('bay-light', { isArchived: true })).rejects.toThrow(/HTTP 500/);
  });
});
