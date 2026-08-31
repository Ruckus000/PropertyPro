import React, { type PropsWithChildren } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPasswordMock, acceptInvitationMutateAsyncMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  acceptInvitationMutateAsyncMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
    },
  }),
}));

vi.mock('@/hooks/use-invitations', () => ({
  useAcceptInvitation: () => ({ mutateAsync: acceptInvitationMutateAsyncMock }),
}));

import { SetPasswordForm } from '../../src/components/auth/set-password-form';

// SetPasswordForm now sources the invitation PATCH from the use-invitations
// TanStack mutation hook, so it must render inside a QueryClientProvider.
function Wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('SetPasswordForm', () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
    signInWithPasswordMock.mockResolvedValue({ error: null });
    acceptInvitationMutateAsyncMock.mockReset();
    acceptInvitationMutateAsyncMock.mockResolvedValue('invited@example.com');
  });

  it('routes to the community welcome screen on success (B1)', async () => {
    render(
      <Wrapper>
        <SetPasswordForm token="invite-token" communityId={7} />
      </Wrapper>,
    );
    const form = screen.getByTestId('set-password-form');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Abcdefg1!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Abcdefg1!' } });
    fireEvent.click(screen.getByTestId('invite-terms-checkbox'));

    await act(async () => {
      fireEvent.submit(form);
    });

    const success = await screen.findByTestId('invite-success');
    const link = success.querySelector('a');
    expect(link).toHaveAttribute('href', '/welcome?communityId=7');
  });

  // ── Clickwrap ──────────────────────────────────────────────────────────────
  //
  // Invited residents reach the product ONLY through this form. Before this,
  // they accepted nothing, while ToS §2 purports to bind "all users ...
  // including unit owners or residents" — so the liability cap and disclaimers
  // were materially weaker against exactly the people most likely to be harmed
  // by a notice failure. See docs/audits/2026-08-09-legal-risk-audit.md F-18.

  it('links the Terms and Privacy Policy next to the acceptance checkbox', () => {
    render(
      <Wrapper>
        <SetPasswordForm token="invite-token" communityId={7} />
      </Wrapper>,
    );

    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
  });

  it('defaults the acceptance checkbox to unchecked', () => {
    render(
      <Wrapper>
        <SetPasswordForm token="invite-token" communityId={7} />
      </Wrapper>,
    );

    // A pre-checked box is not assent. This must never be flipped to `true`.
    expect(screen.getByTestId('invite-terms-checkbox')).not.toBeChecked();
  });

  it('does not accept the invitation when the terms are not accepted', async () => {
    render(
      <Wrapper>
        <SetPasswordForm token="invite-token" communityId={7} />
      </Wrapper>,
    );
    const form = screen.getByTestId('set-password-form');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Abcdefg1!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Abcdefg1!' } });
    // Checkbox deliberately left unticked, and the form submitted
    // programmatically — which bypasses the input's `required` attribute
    // exactly the way a scripted client would.
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(acceptInvitationMutateAsyncMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('set-password-error')).toHaveTextContent(
      'Please accept the Terms of Service and Privacy Policy to continue.',
    );
  });

  it('clears stale password validation errors when the password changes', async () => {
    render(
      <Wrapper>
        <SetPasswordForm token="invite-token" communityId={1} />
      </Wrapper>,
    );
    const form = screen.getByTestId('set-password-form');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abcdefgh' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'abcdefgh' } });

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('set-password-error')).toHaveTextContent('Password must include an uppercase letter');
    });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Abcdefg1!' } });

    await waitFor(() => {
      expect(screen.queryByTestId('set-password-error')).toBeNull();
    });
  });
});
