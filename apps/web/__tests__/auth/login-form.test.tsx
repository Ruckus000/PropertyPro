import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { routerMock, signInWithPasswordMock, createBrowserClientMock } = vi.hoisted(() => ({
  routerMock: {
    replace: vi.fn(),
    refresh: vi.fn(),
  },
  signInWithPasswordMock: vi.fn(),
  createBrowserClientMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@/lib/supabase/client', () => ({ createBrowserClient: createBrowserClientMock }));

import { LoginForm } from '../../src/components/auth/login-form';

describe('LoginForm', () => {
  beforeEach(() => {
    routerMock.replace.mockReset();
    routerMock.refresh.mockReset();
    signInWithPasswordMock.mockReset();
    signInWithPasswordMock.mockResolvedValue({ error: null });
    createBrowserClientMock.mockReset();
    createBrowserClientMock.mockReturnValue({ auth: { signInWithPassword: signInWithPasswordMock } });
  });

  it('clears stale auth errors when credentials change', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    });

    const { container } = render(<LoginForm returnTo="/dashboard" />);
    const form = container.querySelector('form');

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Login form not found');
    }

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad-password' } });

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');
    });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'better-password' } });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows an error and re-enables the button when the auth client cannot be loaded', async () => {
    // The client is imported on submit, so the import can reject (a chunk that
    // fails to load on a flaky connection). That must not leave "Signing in...".
    createBrowserClientMock.mockImplementation(() => {
      throw new Error('ChunkLoadError');
    });

    const { container } = render(<LoginForm returnTo="/dashboard" />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });

    await act(async () => {
      fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("couldn't reach the sign-in service");
    });
    expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
