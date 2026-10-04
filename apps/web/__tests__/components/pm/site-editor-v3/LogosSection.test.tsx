/**
 * The Design tool's Logos section. Logos are LIVE on save, unlike the rest of
 * the tool, so these pin the two-step upload (raw file, then its path to the
 * branding route), Remove sending `null`, and the copy saying it is live.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { brandingRef, uploadMock, saveAsyncMock, saveMutateMock } = vi.hoisted(() => ({
  brandingRef: {
    current: {
      logoPath: null,
      logoUrl: null,
      siteLogoPath: null,
      siteLogoUrl: null,
      customEmailFooter: null,
    } as Record<string, string | null>,
  },
  uploadMock: vi.fn(),
  saveAsyncMock: vi.fn(),
  saveMutateMock: vi.fn(),
}));

vi.mock('@/hooks/use-live-branding', () => ({
  useLiveBranding: () => ({ data: brandingRef.current, isError: false, refetch: vi.fn() }),
  useSaveLiveBranding: () => ({ mutateAsync: saveAsyncMock, mutate: saveMutateMock, isPending: false }),
}));
vi.mock('@/hooks/use-upload-logo', () => ({
  useUploadLogo: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

import { LogosSection } from '@/components/pm/site-editor-v3/panels/LogosSection';

beforeEach(() => {
  vi.clearAllMocks();
  brandingRef.current = {
    logoPath: null,
    logoUrl: null,
    siteLogoPath: null,
    siteLogoUrl: null,
    customEmailFooter: null,
  };
  uploadMock.mockResolvedValue('communities/42/documents/u1/wordmark.png');
  saveAsyncMock.mockResolvedValue(brandingRef.current);
});

describe('LogosSection', () => {
  it('says logos go live without Publish', () => {
    render(<LogosSection communityId={42} />);
    expect(screen.getByText(/logos don.t wait for publish/i)).toBeInTheDocument();
  });

  it('uploads the raw file, then saves its storage path as the site logo', async () => {
    const user = userEvent.setup();
    render(<LogosSection communityId={42} />);
    const file = new File(['png'], 'wordmark.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('Site logo'), file);

    await waitFor(() =>
      expect(saveAsyncMock).toHaveBeenCalledWith({
        siteLogoStoragePath: 'communities/42/documents/u1/wordmark.png',
      }),
    );
    expect(uploadMock).toHaveBeenCalledWith({ communityId: 42, file });
  });

  it('shows the upload error and saves nothing when the upload fails', async () => {
    uploadMock.mockRejectedValueOnce(new Error('Failed to upload logo image'));
    const user = userEvent.setup();
    render(<LogosSection communityId={42} />);

    await user.upload(
      screen.getByLabelText('Square logo'),
      new File(['png'], 'logo.png', { type: 'image/png' }),
    );

    expect(await screen.findByText('Failed to upload logo image')).toBeInTheDocument();
    expect(saveAsyncMock).not.toHaveBeenCalled();
  });

  it('shows the current logo and removes it with null', async () => {
    brandingRef.current = {
      ...brandingRef.current,
      logoPath: 'communities/42/branding/logo.webp',
      logoUrl: 'https://storage/signed-logo',
    };
    const user = userEvent.setup();
    render(<LogosSection communityId={42} />);

    expect(screen.getByAltText('Your current square logo')).toHaveAttribute(
      'src',
      'https://storage/signed-logo',
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(saveMutateMock).toHaveBeenCalledWith({ logoStoragePath: null }, expect.anything());
  });
});
