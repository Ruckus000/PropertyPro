import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { routerMock, signOutMock, onAuthStateChangeMock, getSessionMock, updatePasswordActionMock } =
  vi.hoisted(() => {
    const router = { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
    return {
      routerMock: router,
      signOutMock: vi.fn(),
      onAuthStateChangeMock: vi.fn(),
      getSessionMock: vi.fn(),
      updatePasswordActionMock: vi.fn(),
    };
  });

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@propertypro/db/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: {
      onAuthStateChange: onAuthStateChangeMock,
      getSession: getSessionMock,
      signOut: signOutMock,
    },
  }),
}));

vi.mock('@/lib/auth/actions', () => ({
  updatePasswordAction: updatePasswordActionMock,
}));

import { ResetPasswordForm } from '../../src/components/auth/reset-password-form';

describe('ResetPasswordForm reset → login flow', () => {
  beforeEach(() => {
    routerMock.replace.mockReset();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue({ error: null });
    onAuthStateChangeMock.mockReset();
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    getSessionMock.mockReset();
    // Simulate a live recovery session so the form renders.
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    updatePasswordActionMock.mockReset();
    updatePasswordActionMock.mockResolvedValue({ success: true, message: 'ok' });
  });

  async function renderFormAwaitReady() {
    render(<ResetPasswordForm />);
    // Wait for the form to appear after the async session check resolves.
    return await screen.findByTestId('reset-password-form');
  }

  it('signs out with scope=local and redirects to /auth/login?reset=success on success', async () => {
    const form = await renderFormAwaitReady();

    const password = screen.getByLabelText('New password') as HTMLInputElement;
    const confirm = screen.getByLabelText('Confirm new password') as HTMLInputElement;

    fireEvent.change(password, { target: { value: 'Secure!123' } });
    fireEvent.change(confirm, { target: { value: 'Secure!123' } });

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(updatePasswordActionMock).toHaveBeenCalledWith('Secure!123');
    });
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    });
    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/auth/login?reset=success');
    });
  });

  it('shows the server error and does not redirect when update fails', async () => {
    updatePasswordActionMock.mockResolvedValueOnce({ success: false, message: 'Token has expired' });

    const form = await renderFormAwaitReady();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Secure!123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Secure!123' } });

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('reset-password-error')).toHaveTextContent('Token has expired');
    });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
