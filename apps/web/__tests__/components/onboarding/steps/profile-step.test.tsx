import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileStep } from '../../../../src/components/onboarding/steps/profile-step';

// `ProfileStep` now consumes `useUploadLogo()` (TanStack `useMutation`), so it
// must render inside a `QueryClientProvider`. Behavior is otherwise unchanged
// — the validation literals and submit flow stay in the component.
async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function renderWithClient(element: React.ReactElement): React.ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{element}</QueryClientProvider>;
}

describe('profile step', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('valid logo upload persists logoPath in submitted payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { uploadUrl: 'https://upload.example.com', path: 'logos/community.png' } }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const onNext = vi.fn();

    await act(async () => {
      root.render(
        renderWithClient(
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
          />,
        ),
      );
      await flushEffects();
    });

    const logoInput = container.querySelector('#logo') as HTMLInputElement;

    await act(async () => {
      const logoFile = new File(['logo'], 'logo.png', { type: 'image/png' });
      Object.defineProperty(logoInput, 'files', {
        configurable: true,
        value: [logoFile],
      });
      logoInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Metro Apartments',
        logoPath: 'logos/community.png',
      }),
    );
  });

  it('does not re-upload the logo when a failed onNext is retried', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { uploadUrl: 'https://upload.example.com', path: 'logos/community.png' } }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const onNext = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient server error'))
      .mockResolvedValueOnce(undefined);

    await act(async () => {
      root.render(
        renderWithClient(
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
          />,
        ),
      );
      await flushEffects();
    });

    const logoInput = container.querySelector('#logo') as HTMLInputElement;

    await act(async () => {
      const logoFile = new File(['logo'], 'logo.png', { type: 'image/png' });
      Object.defineProperty(logoInput, 'files', {
        configurable: true,
        value: [logoFile],
      });
      logoInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Selected file: logo.png');

    const form = container.querySelector('form');

    // First submit: upload succeeds (2 fetch calls), onNext rejects.
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('transient server error');
    // UI flips to the resolved-path display; "Selected file" label is gone.
    expect(container.textContent).toContain('Current logo path: logos/community.png');
    expect(container.textContent).not.toContain('Selected file: logo.png');

    // Retry: no logoFile remains, so the upload must NOT run again.
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(onNext).toHaveBeenLastCalledWith(
      expect.objectContaining({ logoPath: 'logos/community.png' }),
    );
  });

  it('rejects oversized logo file', async () => {
    const onNext = vi.fn();

    await act(async () => {
      root.render(renderWithClient(<ProfileStep communityId={42} onNext={onNext} />));
      await flushEffects();
    });

    const logoInput = container.querySelector('#logo') as HTMLInputElement;

    await act(async () => {
      const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
        type: 'image/png',
      });

      Object.defineProperty(logoInput, 'files', {
        configurable: true,
        value: [oversized],
      });
      logoInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flushEffects();
    });

    expect(container.textContent).toContain('Logo image must be 10MB or smaller.');
    expect(onNext).not.toHaveBeenCalled();
  });
});
