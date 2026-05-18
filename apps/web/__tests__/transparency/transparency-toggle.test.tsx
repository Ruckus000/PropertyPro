/**
 * Component test for TransparencyToggle (B5 batch #2 drain).
 *
 * The component now sources its data from the `use-transparency` TanStack
 * Query hooks; the hooks are mocked here so each data-state render and the
 * preserved literals can be asserted directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const useTransparencySettingsMock = vi.fn();
const useUpdateTransparencySettingsMock = vi.fn();

vi.mock('@/hooks/use-transparency', () => ({
  useTransparencySettings: (id: number) => useTransparencySettingsMock(id),
  useUpdateTransparencySettings: (id: number) =>
    useUpdateTransparencySettingsMock(id),
}));

import { TransparencyToggle } from '../../src/components/transparency/transparency-toggle';

function makeMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

beforeEach(() => {
  useTransparencySettingsMock.mockReset();
  useUpdateTransparencySettingsMock.mockReset();
  useUpdateTransparencySettingsMock.mockReturnValue(makeMutation());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TransparencyToggle', () => {
  it('renders the loading state while the query is loading', () => {
    useTransparencySettingsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<TransparencyToggle communityId={1} subdomain="sunset" />);
    expect(
      screen.getByText('Loading transparency settings...'),
    ).toBeInTheDocument();
  });

  it('seeds the form from query data and shows the preview link', () => {
    useTransparencySettingsMock.mockReturnValue({
      data: { enabled: true, acknowledgedAt: '2026-05-18T00:00:00.000Z' },
      isLoading: false,
      isError: false,
    });
    render(<TransparencyToggle communityId={1} subdomain="sunset" />);

    const checkbox = screen.getByLabelText(
      'Enable compliance transparency page',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText('Page is live')).toBeInTheDocument();
    const link = screen.getByText(
      'Preview what your transparency page will look like',
    );
    expect(link).toHaveAttribute('href', '/sunset/transparency');
  });

  it('shows the load-failure copy when the query errors', async () => {
    useTransparencySettingsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<TransparencyToggle communityId={1} subdomain="sunset" />);
    await waitFor(() =>
      expect(
        screen.getByText('Failed to load transparency settings.'),
      ).toBeInTheDocument(),
    );
  });

  it('calls the mutation on submit and shows the success copy', async () => {
    const mutate = vi.fn(
      (
        _vars: unknown,
        opts: { onSuccess: (d: unknown) => void },
      ) => opts.onSuccess({ enabled: false, acknowledgedAt: null }),
    );
    useTransparencySettingsMock.mockReturnValue({
      data: { enabled: false, acknowledgedAt: null },
      isLoading: false,
      isError: false,
    });
    useUpdateTransparencySettingsMock.mockReturnValue(makeMutation({ mutate }));

    render(<TransparencyToggle communityId={1} subdomain="sunset" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(mutate).toHaveBeenCalledWith(
      { enabled: false, acknowledged: false },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText('Transparency settings updated.'),
      ).toBeInTheDocument(),
    );
  });

  it('surfaces the mutation error message verbatim', async () => {
    const mutate = vi.fn(
      (
        _vars: unknown,
        opts: { onError: (e: Error) => void },
      ) => opts.onError(new Error('Failed to save settings')),
    );
    useTransparencySettingsMock.mockReturnValue({
      data: { enabled: false, acknowledgedAt: null },
      isLoading: false,
      isError: false,
    });
    useUpdateTransparencySettingsMock.mockReturnValue(makeMutation({ mutate }));

    render(<TransparencyToggle communityId={1} subdomain="sunset" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() =>
      expect(screen.getByText('Failed to save settings')).toBeInTheDocument(),
    );
  });

  it('resets transient state and reseeds when communityId changes', async () => {
    useTransparencySettingsMock.mockReturnValue({
      data: { enabled: true, acknowledgedAt: '2026-01-01T00:00:00.000Z' },
      isLoading: false,
      isError: false,
    });
    const { rerender } = render(
      <TransparencyToggle communityId={1} subdomain="sunset" />,
    );

    // Tick the acknowledgment box for community 1.
    fireEvent.click(
      screen.getByLabelText('Acknowledge transparency page scope'),
    );
    const ack1 = screen.getByLabelText(
      'Acknowledge transparency page scope',
    ) as HTMLInputElement;
    expect(ack1.checked).toBe(true);

    // Switch to community 2 with different settings.
    useTransparencySettingsMock.mockReturnValue({
      data: { enabled: false, acknowledgedAt: null },
      isLoading: false,
      isError: false,
    });
    rerender(<TransparencyToggle communityId={2} subdomain="palm" />);

    await waitFor(() => {
      const ack2 = screen.getByLabelText(
        'Acknowledge transparency page scope',
      ) as HTMLInputElement;
      expect(ack2.checked).toBe(false);
    });
    const enabled2 = screen.getByLabelText(
      'Enable compliance transparency page',
    ) as HTMLInputElement;
    expect(enabled2.checked).toBe(false);
  });

  it('blocks submit until the acknowledgment box is checked when enabling', () => {
    useTransparencySettingsMock.mockReturnValue({
      data: { enabled: false, acknowledgedAt: null },
      isLoading: false,
      isError: false,
    });
    render(<TransparencyToggle communityId={1} subdomain="sunset" />);

    fireEvent.click(
      screen.getByLabelText('Enable compliance transparency page'),
    );
    expect(
      screen.getByRole('button', { name: 'Save Settings' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Check the acknowledgment box before enabling transparency for the first time.',
      ),
    ).toBeInTheDocument();
  });
});
