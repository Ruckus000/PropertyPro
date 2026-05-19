/**
 * Unit tests for AccountSettingsClient (B5 batch #19, solo drain).
 *
 * Post-drain: every /api/v1 call lives in `use-account-settings`. These
 * tests mock that hook module plus the Supabase browser client (the
 * password flow stays in the component verbatim) and the reauth hook.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';

// ── Hook mocks ──────────────────────────────────────────────

const updateProfileMutate = vi.fn();
const requestDeletionMutate = vi.fn();
const requestDeletionReset = vi.fn();
const cancelDeletionMutate = vi.fn();
const useUpdateProfileMock = vi.fn();
const useDeletionStatusMock = vi.fn();
const useRequestAccountDeletionMock = vi.fn();
const useCancelAccountDeletionMock = vi.fn();

// The component does `err instanceof RootOffboardingAckRequired`, so the class
// it imports and the one the test throws must be the SAME identity.
// `vi.hoisted` is required: vi.mock factories are hoisted above module scope,
// and unlike the mock fns above (deferred behind arrows) a class referenced
// directly in the returned object is evaluated when the factory runs, so a
// plain top-level declaration hits a TDZ ReferenceError.
const { MockAckError } = vi.hoisted(() => ({
  MockAckError: class extends Error {
    communities: Array<{ communityId: number; name: string; hasSuccessor: boolean }>;
    constructor(communities: Array<{ communityId: number; name: string; hasSuccessor: boolean }>) {
      super('Root-offboarding acknowledgement required.');
      this.name = 'RootOffboardingAckRequired';
      this.communities = communities;
    }
  },
}));

vi.mock('@/hooks/use-account-settings', () => ({
  useUpdateProfile: () => useUpdateProfileMock(),
  useDeletionStatus: () => useDeletionStatusMock(),
  useRequestAccountDeletion: () => useRequestAccountDeletionMock(),
  useCancelAccountDeletion: () => useCancelAccountDeletionMock(),
  RootOffboardingAckRequired: MockAckError,
}));

// ── Supabase password flow (stays in component) ─────────────

const signInWithPassword = vi.fn();
const updateUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: { signInWithPassword, updateUser },
  }),
}));

// ── Reauth ──────────────────────────────────────────────────

const triggerReauth = vi.fn();
vi.mock('@/hooks/use-reauth', () => ({
  useReauth: () => ({
    triggerReauth,
    isOpen: false,
    onCancel: vi.fn(),
    onSuccess: vi.fn(),
    verify: vi.fn(),
  }),
}));
vi.mock('@/components/auth/reauth-modal', () => ({
  ReauthModal: () => null,
}));

import { AccountSettingsClient } from '../../src/components/settings/account-settings-client';

function renderComponent() {
  return render(
    <AccountSettingsClient
      userId="user-1"
      email="jane@example.com"
      fullName="Jane Doe"
      phone="555-1234"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useUpdateProfileMock.mockReturnValue({ mutate: updateProfileMutate });
  useDeletionStatusMock.mockReturnValue({ data: null, isLoading: false });
  useRequestAccountDeletionMock.mockReturnValue({
    mutate: requestDeletionMutate,
    reset: requestDeletionReset,
    isPending: false,
    isError: false,
    error: null,
  });
  useCancelAccountDeletionMock.mockReturnValue({
    mutate: cancelDeletionMutate,
    isPending: false,
    isError: false,
    error: null,
  });
});

describe('AccountSettingsClient — profile section', () => {
  it('blocks submit and shows the required-name error without calling the hook', () => {
    renderComponent();
    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByText('Name is required.')).toBeDefined();
    expect(updateProfileMutate).not.toHaveBeenCalled();
  });

  it('submits trimmed values and shows the success message on success', async () => {
    updateProfileMutate.mockImplementation((_input, opts) => opts.onSuccess());
    renderComponent();

    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '  New Name  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(updateProfileMutate).toHaveBeenCalledWith(
      { fullName: 'New Name', phone: '555-1234' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('Profile updated successfully.')).toBeDefined(),
    );
  });

  it('clears the success-banner auto-dismiss timer when unmounted before 5s', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      updateProfileMutate.mockImplementation((_input, opts) => opts.onSuccess());
      const { unmount } = renderComponent();

      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(screen.getByText('Profile updated successfully.')).toBeDefined();

      // Unmount within the 5s window — the effect cleanup must cancel the timer.
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Firing the (now-cancelled) timer must not update an unmounted component.
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      const actWarnings = consoleError.mock.calls.filter(([msg]) =>
        typeof msg === 'string'
          ? msg.includes('not wrapped in act') ||
            msg.includes('unmounted component')
          : false,
      );
      expect(actWarnings).toEqual([]);
    } finally {
      clearTimeoutSpy.mockRestore();
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it('surfaces the hook error message verbatim on failure', async () => {
    updateProfileMutate.mockImplementation((_input, opts) =>
      opts.onError(new Error('Server says no')),
    );
    renderComponent();

    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Valid Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(screen.getByText('Server says no')).toBeDefined(),
    );
  });
});

describe('AccountSettingsClient — password section (Supabase, stays in component)', () => {
  it('verifies current password then updates it via the Supabase SDK', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({ error: null });
    renderComponent();

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'OldPass1!' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'NewPass1!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'NewPass1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() =>
      expect(screen.getByText('Password updated successfully.')).toBeDefined(),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'OldPass1!',
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'NewPass1!' });
  });

  it('shows the incorrect-password error when sign-in fails', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'bad' } });
    renderComponent();

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'wrong' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'NewPass1!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'NewPass1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() =>
      expect(screen.getByText('Current password is incorrect.')).toBeDefined(),
    );
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('AccountSettingsClient — danger zone', () => {
  it('shows a loading skeleton while the deletion status query is loading', () => {
    useDeletionStatusMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderComponent();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows the delete button when there is no active request', () => {
    renderComponent();
    expect(
      screen.getByRole('button', { name: 'Delete My Account' }),
    ).toBeDefined();
  });

  it('gates Confirm Deletion behind typing DELETE, then reauths and mutates', async () => {
    triggerReauth.mockResolvedValue(true);
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));

    const confirmBtn = screen.getByRole('button', {
      name: 'Confirm Deletion',
    }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: 'DELETE' },
    });
    expect(confirmBtn.disabled).toBe(false);

    fireEvent.click(confirmBtn);

    expect(requestDeletionReset).toHaveBeenCalled();
    await waitFor(() =>
      // R3-03b: the first attempt sends acknowledge=false. If the user is root
      // of anything the server answers 409 and the ack dialog takes over.
      expect(requestDeletionMutate).toHaveBeenCalledWith(
        false,
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      ),
    );
  });

  // ── R3-03b: root-offboarding acknowledgement (issue #924) ────────────────
  //
  // A root manager deleting their account leaves the community with nobody who
  // can manage billing. The server answers the first attempt with 409; these
  // cover the second step.

  /** Drives the component to the point where the ack dialog is showing. */
  async function openAckDialog(communities: Array<{ communityId: number; name: string; hasSuccessor: boolean }>) {
    requestDeletionMutate.mockImplementation((_ack: unknown, opts: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new MockAckError(communities));
    });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    fireEvent.change(screen.getByLabelText(/type .*delete.* to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm deletion/i }));
    await waitFor(() =>
      expect(screen.getByText(/leaves communities without a root manager/i)).toBeInTheDocument(),
    );
  }

  it('surfaces the affected communities instead of a generic error', async () => {
    await openAckDialog([{ communityId: 42, name: 'Sunset Condos', hasSuccessor: true }]);

    expect(screen.getByText('Sunset Condos')).toBeInTheDocument();
    expect(screen.getByText(/can claim the root role afterwards/i)).toBeInTheDocument();
  });

  it('calls out a community with no successor — it needs support to recover', async () => {
    // No property_manager remains, so `reassignRootOp` has no valid target and
    // there is no self-service path. The user must be told plainly.
    await openAckDialog([{ communityId: 99, name: 'Nobody Left', hasSuccessor: false }]);

    expect(screen.getByText(/no property manager remains here/i)).toBeInTheDocument();
    expect(screen.getByText(/contacting support/i)).toBeInTheDocument();
  });

  it('re-submits WITH the acknowledgement on confirm', async () => {
    await openAckDialog([{ communityId: 42, name: 'Sunset Condos', hasSuccessor: true }]);
    requestDeletionMutate.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /delete anyway/i }));

    await waitFor(() =>
      expect(requestDeletionMutate).toHaveBeenCalledWith(true, expect.anything()),
    );
  });

  it('backing out does NOT delete anything', async () => {
    await openAckDialog([{ communityId: 42, name: 'Sunset Condos', hasSuccessor: true }]);
    requestDeletionMutate.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    await waitFor(() =>
      expect(screen.queryByText(/leaves communities without a root manager/i)).not.toBeInTheDocument(),
    );
    expect(requestDeletionMutate).not.toHaveBeenCalled();
  });

  it('does not mutate when reauth is declined', async () => {
    triggerReauth.mockResolvedValue(false);
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));
    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Deletion' }));

    await waitFor(() => expect(triggerReauth).toHaveBeenCalled());
    expect(requestDeletionMutate).not.toHaveBeenCalled();
  });

  it('renders the cooling-period banner and cancels deletion', () => {
    useDeletionStatusMock.mockReturnValue({
      data: {
        id: 1,
        status: 'cooling',
        coolingEndsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      },
      isLoading: false,
    });
    renderComponent();

    expect(screen.getByText(/Deletion scheduled/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Deletion' }));
    expect(cancelDeletionMutate).toHaveBeenCalled();
  });

  it('shows the cancel error message when cancellation fails', () => {
    useDeletionStatusMock.mockReturnValue({
      data: {
        id: 1,
        status: 'cooling',
        coolingEndsAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      },
      isLoading: false,
    });
    useCancelAccountDeletionMock.mockReturnValue({
      mutate: cancelDeletionMutate,
      isPending: false,
      isError: true,
      error: new Error('Cannot cancel right now'),
    });
    renderComponent();

    expect(screen.getByText('Cannot cancel right now')).toBeDefined();
  });
});
