/**
 * A6 client guard — when a user returns via "Wrong email? Go back" (carrying an
 * initialSignupRequestId) and re-enters their email, the reused signupRequestId
 * must be dropped so the corrected email starts a fresh signup. The server
 * rejects a reused id with a changed email as a hijack guard, so reusing it would
 * dead-end a legitimate correction.
 */
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SubdomainAvailability } from '../../src/components/signup/subdomain-checker';

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const { pushMock, createSignupMutateAsync } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  createSignupMutateAsync: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../../src/components/signup/subdomain-checker', async () => {
  const React = await import('react');
  return {
    SubdomainChecker: ({
      value,
      onChange,
      onAvailabilityChange,
    }: {
      value: string;
      onChange: (v: string) => void;
      onAvailabilityChange: (s: SubdomainAvailability | null) => void;
    }) =>
      React.createElement(
        'div',
        null,
        React.createElement('input', {
          'aria-label': 'subdomain-input',
          value,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
        }),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () =>
              onAvailabilityChange({
                normalizedSubdomain: value,
                available: true,
                reason: 'available',
                message: 'available',
              }),
          },
          'reason-available',
        ),
      ),
  };
});

vi.mock('@/hooks/use-signup', () => ({
  SignupApiError: class SignupApiError extends Error {},
  useCreateSignup: () => ({ mutateAsync: createSignupMutateAsync, isPending: false }),
  useConfirmEmailVerification: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SignupForm } from '../../src/components/signup/signup-form';

function fillRequiredSignupFields(): void {
  fireEvent.change(screen.getByLabelText('Primary Contact Name'), { target: { value: 'Jordan Admin' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'corrected@example.com' } });
  fireEvent.change(screen.getByLabelText('Community Name'), { target: { value: 'Ocean Breeze HOA' } });
  fireEvent.change(screen.getByLabelText('Street Address'), { target: { value: '123 Palm Ave' } });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'West Palm Beach' } });
  fireEvent.change(screen.getByLabelText('State'), { target: { value: 'FL' } });
  fireEvent.change(screen.getByLabelText('ZIP Code'), { target: { value: '33401' } });
  fireEvent.change(screen.getByLabelText('County'), { target: { value: 'Palm Beach' } });
  fireEvent.change(screen.getByLabelText('Unit Count'), { target: { value: '120' } });
  fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Abcdefg1!' } });
  fireEvent.change(screen.getByLabelText('subdomain-input'), { target: { value: 'ocean-breeze-hoa' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('SignupForm email correction (A6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSignupMutateAsync.mockResolvedValue({
      signupRequestId: 'server-generated',
      verificationRequired: true,
      message: 'Check your email',
    });
  });

  it('drops the reused signupRequestId once the returning user enters an email', async () => {
    render(<SignupForm initialSignupRequestId="reused-id-123" />);

    fillRequiredSignupFields();
    act(() => {
      fireEvent.click(screen.getByText('reason-available'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    expect(createSignupMutateAsync).toHaveBeenCalledTimes(1);
    const body = createSignupMutateAsync.mock.calls[0]?.[0] as {
      email: string;
      signupRequestId?: string;
    };
    expect(body.email).toBe('corrected@example.com');
    expect(body.signupRequestId).toBeUndefined();
  });
});
