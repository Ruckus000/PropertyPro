// @vitest-environment jsdom
/**
 * Operator Console two-factor step: which auth error text reaches the screen.
 *
 * Same rule as the login page (see login-page-errors.test.tsx): only an
 * AuthApiError was written by the Supabase server, so only that one is shown
 * verbatim. A browser fetch failure arrives as an AuthRetryableFetchError whose
 * message Safari suffixes with the project host.
 *
 * The one non-API case that must NOT read as a network problem is a revoked
 * session: GoTrue answers `session_not_found`, auth-js maps that to
 * AuthSessionMissingError, and "try again" can never succeed for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js';

const { routerMock, mfa } = vi.hoisted(() => ({
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
    unenroll: vi.fn(),
    enroll: vi.fn(),
    challengeAndVerify: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: { mfa, signOut: vi.fn() } })),
}));

import MfaPage from '@/app/auth/mfa/page';

const HOST_LEAK = /supabase|abc123xyz|Load failed/;

/** An operator who already has a verified authenticator: the challenge step. */
function withVerifiedFactor(): void {
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' } });
  mfa.listFactors.mockResolvedValue({
    data: { all: [], totp: [{ id: 'factor-1', status: 'verified' }] },
    error: null,
  });
}

/** An operator with no factor yet: reaches `mfa.enroll`. */
function withNoFactor(): void {
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' } });
  mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
}

async function submitCode(container: HTMLElement): Promise<void> {
  const input = await waitFor(() => {
    const el = container.querySelector('#mfa-code');
    if (!el) throw new Error('code input not rendered yet');
    return el as HTMLInputElement;
  });
  fireEvent.change(input, { target: { value: '123456' } });
  await act(async () => {
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
  });
}

function alertText(container: HTMLElement): string | null {
  return container.querySelector('[role="alert"]')?.textContent ?? null;
}

describe('admin MFA page error text', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc123xyz.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    for (const fn of Object.values(mfa)) fn.mockReset();
    routerMock.push.mockReset();
    routerMock.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  describe('verifying a code', () => {
    it('shows a server-written message verbatim, e.g. a wrong code (control)', async () => {
      withVerifiedFactor();
      mfa.challengeAndVerify.mockResolvedValueOnce({
        data: null,
        error: new AuthApiError('Invalid TOTP code entered', 400, 'mfa_verification_failed'),
      });
      const { container } = render(<MfaPage />);

      await submitCode(container);

      await waitFor(() => expect(alertText(container)).toBe('Invalid TOTP code entered'));
      expect(routerMock.push).not.toHaveBeenCalled();
    });

    it('hides the browser fetch text, which names the Supabase host, for a network failure', async () => {
      withVerifiedFactor();
      mfa.challengeAndVerify.mockResolvedValueOnce({
        data: null,
        error: new AuthRetryableFetchError('Load failed (abc123xyz.supabase.co)', 0),
      });
      const { container } = render(<MfaPage />);

      await submitCode(container);

      await waitFor(() =>
        expect(alertText(container)).toContain("couldn't reach the verification service"),
      );
      expect(alertText(container)).not.toMatch(HOST_LEAK);
      expect(routerMock.push).not.toHaveBeenCalled();
    });

    it('tells an operator with a revoked session to sign in again, not to retry', async () => {
      withVerifiedFactor();
      mfa.challengeAndVerify.mockResolvedValueOnce({
        data: null,
        error: new AuthSessionMissingError(),
      });
      const { container } = render(<MfaPage />);

      await submitCode(container);

      await waitFor(() => expect(alertText(container)).toContain('Sign out and sign in again'));
      expect(alertText(container)).not.toContain("couldn't reach");
      expect(alertText(container)).not.toMatch(HOST_LEAK);
    });

    it('navigates and shows no error on success', async () => {
      withVerifiedFactor();
      mfa.challengeAndVerify.mockResolvedValueOnce({ data: {}, error: null });
      const { container } = render(<MfaPage />);

      await submitCode(container);

      await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
      expect(alertText(container)).toBeNull();
    });
  });

  describe('starting authenticator setup', () => {
    it('shows a server-written enrol message verbatim (control)', async () => {
      withNoFactor();
      mfa.enroll.mockResolvedValueOnce({
        data: null,
        error: new AuthApiError('Maximum number of verified factors reached', 422, 'too_many_factors'),
      });
      const { container } = render(<MfaPage />);

      await waitFor(() =>
        expect(alertText(container)).toBe('Maximum number of verified factors reached'),
      );
    });

    it('hides the browser fetch text for a network failure and shows the fixed fallback', async () => {
      withNoFactor();
      mfa.enroll.mockResolvedValueOnce({
        data: null,
        error: new AuthRetryableFetchError('Load failed (abc123xyz.supabase.co)', 0),
      });
      const { container } = render(<MfaPage />);

      await waitFor(() =>
        expect(alertText(container)).toBe('Could not start authenticator setup.'),
      );
      expect(alertText(container)).not.toMatch(HOST_LEAK);
    });
  });
});
