import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
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

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
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

  it('does not show the browser fetch text (which names the Supabase host) for a network failure', async () => {
    // signInWithPassword RETURNS this rather than throwing it, so the form's catch
    // never sees it. Safari's wording appends the project host.
    signInWithPasswordMock.mockResolvedValueOnce({
      error: new AuthRetryableFetchError('Load failed (abc123xyz.supabase.co)', 0),
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
    expect(screen.getByRole('alert')).not.toHaveTextContent(/supabase|abc123xyz|Load failed/);
    expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
    expect(routerMock.replace).not.toHaveBeenCalled();
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

  it('links to forgot-password next to the password field', () => {
    render(<LoginForm returnTo="/dashboard" />);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/auth/forgot-password',
    );
  });

  it('toggles password visibility', () => {
    render(<LoginForm returnTo="/dashboard" />);
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('shows the full-screen loader naming the community after a successful sign-in', async () => {
    const { container } = render(<LoginForm returnTo="/dashboard" destinationName="Sunset Condos" />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });

    await act(async () => {
      fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Opening Sunset Condos');
    });
    expect(routerMock.replace).toHaveBeenCalledWith('/dashboard');
    expect(screen.getByRole('button', { name: /Sign In/ })).toBeDisabled();
  });

  it('does not show the loader when sign-in fails', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });
    const { container } = render(<LoginForm returnTo="/dashboard" destinationName="Sunset Condos" />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad' } });

    await act(async () => {
      fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
