/**
 * Behavior tests for BrandingForm post-B5 drain (batch #12).
 *
 * `useSaveBranding` is mocked with a controllable mutation so we can assert
 * the component-owned behavior that must remain byte-identical:
 *  - logo size/type validation literals (still client-side, before submit)
 *  - the exact mutateAsync payload
 *  - the success side-effect
 *  - the `err instanceof Error ? err.message : 'An unexpected error occurred'`
 *    catch fallback
 *
 * Mirrors apps/web/__tests__/contracts/contract-table.test.tsx.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

const mutateAsyncMock = vi.fn();
vi.mock('@/hooks/use-branding-form', () => ({
  useSaveBranding: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

import { BrandingForm } from '../../src/components/pm/BrandingForm';

// PNG magic bytes so detectImageMimeFromMagicBytes() accepts a valid file.
function pngFile(name = 'logo.png', sizeBytes = 1024) {
  const header = [0x89, 0x50, 0x4e, 0x47];
  const buf = new Uint8Array(Math.max(sizeBytes, header.length));
  buf.set(header, 0);
  return new File([buf], name, { type: 'image/png' });
}

function setFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('BrandingForm behavior (drained hook mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsyncMock.mockResolvedValue(undefined);
  });

  it('oversize logo shows literal; submit never passes the rejected file', async () => {
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    setFile(pngFile('big.png', 11 * 1024 * 1024));
    expect(await screen.findByText('Logo must be 10 MB or smaller.')).toBeInTheDocument();
    // The oversize file was rejected by handleLogoChange, so it never entered
    // component state — submitting still works but with logoFile: null.
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(mutateAsyncMock.mock.calls[0]![0]).toMatchObject({ logoFile: null });
  });

  it('bad type shows the PNG/JPEG/WebP literal', async () => {
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    const bad = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'x.gif', {
      type: 'image/gif',
    });
    setFile(bad);
    expect(
      await screen.findByText('Logo must be a PNG, JPEG, or WebP image.'),
    ).toBeInTheDocument();
  });

  it('happy submit calls mutateAsync with the exact payload', async () => {
    render(
      <BrandingForm
        communityId={7}
        initialBranding={{
          primaryColor: '#111111',
          secondaryColor: '#222222',
          accentColor: '#333333',
          fontHeading: 'Inter',
          fontBody: 'Inter',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      communityId: 7,
      primaryColor: '#111111',
      secondaryColor: '#222222',
      accentColor: '#333333',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      customEmailFooter: '',
      logoFile: null,
      siteLogoFile: null,
    });
    // Success side-effect: success banner shown.
    expect(
      await screen.findByText('Branding saved successfully'),
    ).toBeInTheDocument();
  });

  it('mutateAsync rejection renders the exact thrown message', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('Failed to save branding'));
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));
    expect(await screen.findByText('Failed to save branding')).toBeInTheDocument();
  });

  it('non-Error rejection falls back to "An unexpected error occurred"', async () => {
    mutateAsyncMock.mockRejectedValue('string boom');
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));
    expect(
      await screen.findByText('An unexpected error occurred'),
    ).toBeInTheDocument();
  });
});
