import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSignedUrl, getPublicUrl, from } = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/community-assets/${path}` },
  }));
  const from = vi.fn(() => ({ createSignedUrl, getPublicUrl }));
  return { createSignedUrl, getPublicUrl, from };
});

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from } }),
}));

import { resolveLogoPreviewUrl } from '@/lib/branding/logo-preview-url';

describe('resolveLogoPreviewUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage/signed' }, error: null });
  });

  it('signs a web-uploaded logo from the private documents bucket', async () => {
    await expect(resolveLogoPreviewUrl(42, 'communities/42/branding/logo.webp')).resolves.toBe(
      'https://storage/signed',
    );
    expect(from).toHaveBeenCalledWith('documents');
  });

  it('gives an admin-uploaded logo its public community-assets URL', async () => {
    await expect(resolveLogoPreviewUrl(42, '42/site/abc.png')).resolves.toBe(
      'https://proj.supabase.co/storage/v1/object/public/community-assets/42/site/abc.png',
    );
    expect(from).toHaveBeenCalledWith('community-assets');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it.each([
    'communities/43/documents/u/x.png',
    '43/site/abc.png',
    '420/site/abc.png',
    'communities/42/../43/x.png',
    '',
    undefined,
  ])('gives no URL for %s', async (path) => {
    await expect(resolveLogoPreviewUrl(42, path)).resolves.toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('gives no URL when signing fails', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    await expect(resolveLogoPreviewUrl(42, 'communities/42/branding/logo.webp')).resolves.toBeNull();
  });
});
