/**
 * Component test for SetPasswordForm's hook-backed submit flow
 * (B5 batch #3 drain). The invitation PATCH lives in the
 * use-invitations hook, mocked here so success / sign-in-failure /
 * token-error copy can be asserted without a real network call.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPasswordMock, mutateAsyncMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}));

vi.mock('@/hooks/use-invitations', () => ({
  useAcceptInvitation: () => ({ mutateAsync: mutateAsyncMock }),
}));

import { SetPasswordForm } from '../../src/components/auth/set-password-form';

const VALID = 'Abcdefg1!';

async function submitValid() {
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: VALID },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: VALID },
  });
  await act(async () => {
    fireEvent.submit(screen.getByTestId('set-password-form'));
  });
}

beforeEach(() => {
  signInWithPasswordMock.mockReset();
  signInWithPasswordMock.mockResolvedValue({ error: null });
  mutateAsyncMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SetPasswordForm — hook submit flow', () => {
  it('signs in and shows the success state on a successful accept', async () => {
    mutateAsyncMock.mockResolvedValueOnce('user@example.com');
    render(<SetPasswordForm token="tok" communityId={9} />);

    await submitValid();

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      token: 'tok',
      communityId: 9,
      password: VALID,
    });
    await waitFor(() =>
      expect(screen.getByTestId('invite-success')).toBeInTheDocument(),
    );
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: VALID,
    });
  });

  it('renders the thrown invitation error verbatim', async () => {
    mutateAsyncMock.mockRejectedValueOnce(
      new Error('This invitation link has expired.'),
    );
    render(<SetPasswordForm token="tok" communityId={9} />);

    await submitValid();

    await waitFor(() =>
      expect(screen.getByTestId('set-password-error')).toHaveTextContent(
        'This invitation link has expired.',
      ),
    );
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('shows the sign-in-failure copy when Supabase sign-in fails', async () => {
    mutateAsyncMock.mockResolvedValueOnce('user@example.com');
    signInWithPasswordMock.mockResolvedValueOnce({ error: { message: 'no' } });
    render(<SetPasswordForm token="tok" communityId={9} />);

    await submitValid();

    await waitFor(() =>
      expect(screen.getByTestId('set-password-error')).toHaveTextContent(
        'Account created, but failed to sign in. Please log in manually.',
      ),
    );
  });
});
