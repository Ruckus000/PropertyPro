import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createPresignedDownloadUrlMock } = vi.hoisted(() => ({
  createPresignedDownloadUrlMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

import { resolveBrandingImageUrl } from '../../../src/lib/branding/branding-image-url';

describe('resolveBrandingImageUrl', () => {
  beforeEach(() => {
    createPresignedDownloadUrlMock.mockReset();
    createPresignedDownloadUrlMock.mockResolvedValue('https://storage/signed');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
  });

  it('signs a web-uploaded logo from the private documents bucket', async () => {
    await expect(resolveBrandingImageUrl(7, 'communities/7/branding/logo.webp')).resolves.toBe(
      'https://storage/signed',
    );
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith('documents', 'communities/7/branding/logo.webp');
  });

  it('builds a public URL for an admin-uploaded logo in community-assets', async () => {
    await expect(resolveBrandingImageUrl(7, '7/site/abc.png')).resolves.toBe(
      'https://proj.supabase.co/storage/v1/object/public/community-assets/7/site/abc.png',
    );
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it.each([
    ['another community, documents', 'communities/8/documents/u/minutes.png'],
    ['another community, community-assets', '8/site/abc.png'],
    ['a prefix that only shares digits', '70/site/abc.png'],
    ['traversal out of the prefix', 'communities/7/../8/documents/u/x.png'],
    ['a backslash', 'communities/7\\..\\8/x.png'],
    ['an empty string', ''],
    ['null', null],
  ])('returns null and signs nothing for %s', async (_label, path) => {
    await expect(resolveBrandingImageUrl(7, path)).resolves.toBeNull();
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns null when signing fails, so the page renders without a logo', async () => {
    createPresignedDownloadUrlMock.mockRejectedValueOnce(new Error('Object not found'));
    await expect(resolveBrandingImageUrl(7, 'communities/7/branding/logo.webp')).resolves.toBeNull();
  });
});
