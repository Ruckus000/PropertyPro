/**
 * Unit tests for SupportAccessSettings (B5 batch #4A).
 *
 * Post-drain: the mount-time GET and the toggle POST live in
 * `use-support-access`. These tests mock that hook and render the
 * component — the surface the settings page imports.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SupportAccessData } from '../../src/hooks/use-support-access';

const useSupportAccessMock = vi.fn();
const useToggleMock = vi.fn();

vi.mock('@/hooks/use-support-access', () => ({
  useSupportAccess: () => useSupportAccessMock(),
  useToggleSupportAccess: () => useToggleMock(),
  SUPPORT_ACCESS_QUERY_KEY: (id: number) => ['support-access', id],
}));

import { SupportAccessSettings } from '../../src/components/settings/SupportAccessSettings';

const SAMPLE: SupportAccessData = {
  consentActive: true,
  consent: {
    id: 1,
    community_id: 42,
    granted_by: 'user-1',
    granted_at: '2026-01-01T00:00:00Z',
    revoked_at: null,
  },
  recentAccess: [
    {
      id: 5,
      event: 'consent_granted',
      admin_user_id: 'user-1',
      metadata: null,
      created_at: '2026-01-02T10:00:00Z',
    },
  ],
};

function setQuery(state: {
  data?: SupportAccessData | null;
  isLoading?: boolean;
  error?: Error | null;
}) {
  useSupportAccessMock.mockReturnValue({
    data: state.data ?? undefined,
    isLoading: state.isLoading ?? false,
    error: state.error ?? null,
  });
}

function setToggle(overrides: Partial<{ mutateAsync: () => Promise<unknown>; isPending: boolean }> = {}) {
  const mutateAsync = overrides.mutateAsync ?? vi.fn().mockResolvedValue({ ok: true });
  useToggleMock.mockReturnValue({
    mutateAsync,
    isPending: overrides.isPending ?? false,
  });
  return mutateAsync;
}

beforeEach(() => {
  useSupportAccessMock.mockReset();
  useToggleMock.mockReset();
});

describe('SupportAccessSettings', () => {
  it('shows the loading spinner', () => {
    setQuery({ isLoading: true });
    setToggle();
    const { container } = render(<SupportAccessSettings communityId={42} />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders the full-card error when load fails and no data', () => {
    setQuery({ error: new Error('You lack permission.') });
    setToggle();
    render(<SupportAccessSettings communityId={42} />);
    expect(screen.getByRole('alert').textContent).toBe('You lack permission.');
  });

  it('falls back to the network literal when the error has no message', () => {
    setQuery({ error: new Error('') });
    setToggle();
    render(<SupportAccessSettings communityId={42} />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Network error. Please try again.',
    );
  });

  it('renders the success state with consent date and recent activity', () => {
    setQuery({ data: SAMPLE });
    setToggle();
    render(<SupportAccessSettings communityId={42} />);

    expect(screen.getByText('Support Access')).toBeDefined();
    expect(screen.getByText(/Enabled since/)).toBeDefined();
    expect(screen.getByText('Recent Support Activity')).toBeDefined();
    expect(screen.getByText('consent_granted')).toBeDefined();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('shows the no-activity copy when consent is active with empty log', () => {
    setQuery({
      data: { consentActive: true, consent: SAMPLE.consent, recentAccess: [] },
    });
    setToggle();
    render(<SupportAccessSettings communityId={42} />);
    expect(screen.getByText('No support activity yet.')).toBeDefined();
  });

  it('calls the toggle mutation with the inverted consent state', async () => {
    setQuery({ data: SAMPLE });
    const mutateAsync = setToggle();
    render(<SupportAccessSettings communityId={42} />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ enabled: false }),
    );
  });

  it('surfaces the toggle error literal on mutation rejection', async () => {
    setQuery({ data: SAMPLE });
    setToggle({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Failed to update support access')),
    });
    render(<SupportAccessSettings communityId={42} />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(
        screen.getByText('Failed to update support access'),
      ).toBeDefined(),
    );
  });

  it('falls back to the network literal on a non-Error toggle rejection', async () => {
    setQuery({ data: SAMPLE });
    setToggle({ mutateAsync: vi.fn().mockRejectedValue('boom') });
    render(<SupportAccessSettings communityId={42} />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(screen.getByText('Network error. Please try again.')).toBeDefined(),
    );
  });

  it('shows the network literal (not the raw message) on a query TypeError — genuine fetch network failure', () => {
    // A real offline `fetch` rejects with a TypeError ("Failed to fetch").
    // Pre-B5 the bare try/catch showed the network literal; preserve that.
    setQuery({ error: new TypeError('Failed to fetch') });
    setToggle();
    render(<SupportAccessSettings communityId={42} />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Network error. Please try again.',
    );
  });

  it('shows the network literal on a toggle TypeError rejection', async () => {
    setQuery({ data: SAMPLE });
    setToggle({
      mutateAsync: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });
    render(<SupportAccessSettings communityId={42} />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(screen.getByText('Network error. Please try again.')).toBeDefined(),
    );
  });
});
