/**
 * Unit tests for ProfileStep (B5 batch #11 drain of
 * onboarding/steps/profile-step.tsx).
 *
 * Post-drain: the two-leg logo upload moved into `useUploadLogo()`. The file
 * type/size validation, the `setError` flow, the `onNext` call, and the
 * `submitError instanceof Error ? .message : 'Failed to save profile step'`
 * catch fallback all STAY in the component — those literals are tested here
 * with a controllable `useUploadLogo` mock. Mirrors
 * `apps/web/__tests__/contracts/contract-table.test.tsx`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mutateAsyncMock = vi.fn();

vi.mock('@/hooks/use-upload-logo', () => ({
  useUploadLogo: () => ({ mutateAsync: mutateAsyncMock }),
}));

import { ProfileStep } from '../../src/components/onboarding/steps/profile-step';

function renderStep(onNext = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <ProfileStep
        communityId={42}
        onNext={onNext}
        initialData={{
          name: 'Metro Apartments',
          addressLine1: '123 Main St',
          city: 'Miami',
          state: 'FL',
          zipCode: '33101',
          timezone: 'America/New_York',
        }}
      />
    </QueryClientProvider>,
  );
  return { onNext };
}

function selectFile(file: File): void {
  const input = document.querySelector('#logo') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  fireEvent.change(input);
}

describe('ProfileStep', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
  });

  it('rejects an invalid file type with the exact literal and never calls mutateAsync', () => {
    renderStep();
    selectFile(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));

    expect(screen.getByText('Logo must be a PNG, JPG, JPEG, WEBP, or SVG image.')).toBeDefined();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized file with the exact literal and never calls mutateAsync', () => {
    renderStep();
    selectFile(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }),
    );

    expect(screen.getByText('Logo image must be 10MB or smaller.')).toBeDefined();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('happy path: calls mutateAsync with {communityId,file} then onNext with the resolved logoPath', async () => {
    mutateAsyncMock.mockResolvedValue('logos/community.png');
    const { onNext } = renderStep();

    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    selectFile(file);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(mutateAsyncMock).toHaveBeenCalledWith({ communityId: 42, file });
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Metro Apartments',
        logoPath: 'logos/community.png',
      }),
    );
  });

  it('renders the exact thrown error message when mutateAsync rejects with an Error', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('Failed to upload logo image'));
    const { onNext } = renderStep();

    selectFile(new File(['logo'], 'logo.png', { type: 'image/png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(screen.getByText('Failed to upload logo image')).toBeDefined(),
    );
    expect(onNext).not.toHaveBeenCalled();
  });

  it('falls back to "Failed to save profile step" on a non-Error rejection', async () => {
    mutateAsyncMock.mockRejectedValue('boom');
    const { onNext } = renderStep();

    selectFile(new File(['logo'], 'logo.png', { type: 'image/png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(screen.getByText('Failed to save profile step')).toBeDefined(),
    );
    expect(onNext).not.toHaveBeenCalled();
  });
});
