// @vitest-environment jsdom
/**
 * Operator Console sign-in: which auth error text reaches the screen.
 *
 * supabase-js RETURNS a network failure from signInWithPassword as an
 * AuthRetryableFetchError whose message is the browser's own fetch text, and
 * Safari appends the project host to it ("Load failed (<ref>.supabase.co)").
 * Only an AuthApiError was written by the Supabase server, so only that one may
 * be shown verbatim. These use REAL auth-js error classes rather than
 * hand-shaped `{ name }` objects, so an auth-js upgrade that changes the
 * classification fails here instead of in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from '@supabase/supabase-js';

const { routerMock, signInWithPasswordMock } = vi.hoisted(() => ({
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  signInWithPasswordMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: { signInWithPassword: signInWithPasswordMock } })),
}));

import LoginPage from '@/app/auth/login/page';

const HOST_LEAK = /supabase|abc123xyz|Load failed/;

async function submitCredentials(container: HTMLElement): Promise<void> {
  fireEvent.change(container.querySelector('#email') as HTMLInputElement, {
    target: { value: 'ops@getpropertypro.com' },
  });
  fireEvent.change(container.querySelector('#password') as HTMLInputElement, {
    target: { value: 'pw' },
  });
  await act(async () => {
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
  });
}

/** The error paragraph is the only `<p>` carrying the danger styling. */
function errorText(container: HTMLElement): string | null {
  return container.querySelector('p.text-status-danger')?.textContent ?? null;
}

describe('admin login page error text', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc123xyz.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    signInWithPasswordMock.mockReset();
    routerMock.push.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('shows a server-written message verbatim (control)', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });
    const { container } = render(<LoginPage />);

    await submitCredentials(container);

    await waitFor(() => expect(errorText(container)).toBe('Invalid login credentials'));
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('hides the browser fetch text, which names the Supabase host, for a network failure', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      error: new AuthRetryableFetchError('Load failed (abc123xyz.supabase.co)', 0),
    });
    const { container } = render(<LoginPage />);

    await submitCredentials(container);

    await waitFor(() => expect(errorText(container)).toContain("couldn't reach the sign-in service"));
    expect(errorText(container)).not.toMatch(HOST_LEAK);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('hides a non-JSON gateway failure (AuthUnknownError) the same way', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      error: new AuthUnknownError('Unexpected token < in JSON at abc123xyz.supabase.co', new Error('x')),
    });
    const { container } = render(<LoginPage />);

    await submitCredentials(container);

    await waitFor(() => expect(errorText(container)).toContain("couldn't reach the sign-in service"));
    expect(errorText(container)).not.toMatch(HOST_LEAK);
  });

  it('navigates and shows no error on success', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({ error: null });
    const { container } = render(<LoginPage />);

    await submitCredentials(container);

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(errorText(container)).toBeNull();
  });
});
