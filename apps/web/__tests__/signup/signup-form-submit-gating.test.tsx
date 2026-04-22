import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubdomainAvailability } from '../../src/components/signup/subdomain-checker';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Stub SubdomainChecker to expose `onChange` + `onAvailabilityChange` without
// firing any real fetches. The test wires a free-form input plus buttons that
// push specific availability reasons through the parent's state machine.
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
    }) => {
      const pushReason = (reason: SubdomainAvailability['reason']) => {
        onAvailabilityChange({
          normalizedSubdomain: value,
          available: reason === 'available',
          reason,
          message: `reason=${reason}`,
        });
      };
      return React.createElement(
        'div',
        { 'data-testid': 'subdomain-checker-stub' },
        React.createElement('input', {
          'aria-label': 'subdomain-input',
          value,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
        }),
        React.createElement(
          'button',
          { type: 'button', onClick: () => pushReason('available') },
          'reason-available',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => pushReason('taken') },
          'reason-taken',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => pushReason('reserved') },
          'reason-reserved',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => pushReason('unknown') },
          'reason-unknown',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => pushReason('checking') },
          'reason-checking',
        ),
      );
    },
  };
});

import { SignupForm } from '../../src/components/signup/signup-form';

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement;
}

function setSlug(value: string): void {
  const input = screen.getByLabelText('subdomain-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function pushReason(label: string): void {
  act(() => {
    fireEvent.click(screen.getByText(label));
  });
}

function fillRequiredSignupFields(): void {
  fireEvent.change(screen.getByLabelText('Primary Contact Name'), {
    target: { value: 'Jordan Admin' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'jordan@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Community Name'), {
    target: { value: 'Ocean Breeze HOA' },
  });
  fireEvent.change(screen.getByLabelText('Street Address'), {
    target: { value: '123 Palm Ave' },
  });
  fireEvent.change(screen.getByLabelText('City'), {
    target: { value: 'West Palm Beach' },
  });
  fireEvent.change(screen.getByLabelText('State'), {
    target: { value: 'FL' },
  });
  fireEvent.change(screen.getByLabelText('ZIP Code'), {
    target: { value: '33401' },
  });
  fireEvent.change(screen.getByLabelText('County'), {
    target: { value: 'Palm Beach' },
  });
  fireEvent.change(screen.getByLabelText('Unit Count'), {
    target: { value: '120' },
  });
  fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), {
    target: { value: 'abcdefgh' },
  });
  setSlug('ocean-breeze-hoa');
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('SignupForm submit gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables submit when normalized slug is empty', () => {
    render(<SignupForm />);
    expect(submitButton().disabled).toBe(true);
  });

  it('disables submit when slug is shorter than 3 chars', () => {
    render(<SignupForm />);
    setSlug('ab');
    expect(submitButton().disabled).toBe(true);
  });

  it("enables submit when local syntax is valid and server reason is 'taken'", () => {
    render(<SignupForm />);
    setSlug('valid-slug');
    pushReason('reason-taken');
    expect(submitButton().disabled).toBe(false);
  });

  it("enables submit when local syntax is valid and server reason is 'reserved'", () => {
    render(<SignupForm />);
    setSlug('valid-slug');
    pushReason('reason-reserved');
    expect(submitButton().disabled).toBe(false);
  });

  it("enables submit when local syntax is valid and server reason is 'unknown' (transient failure)", () => {
    render(<SignupForm />);
    setSlug('valid-slug');
    pushReason('reason-unknown');
    expect(submitButton().disabled).toBe(false);
  });

  it("keeps submit enabled while server reason is 'checking'", () => {
    render(<SignupForm />);
    setSlug('valid-slug');
    pushReason('reason-checking');
    expect(submitButton().disabled).toBe(false);
  });

  it("enables submit when local syntax is valid and server reason is 'available'", () => {
    render(<SignupForm />);
    setSlug('valid-slug');
    pushReason('reason-available');
    expect(submitButton().disabled).toBe(false);
  });

  it('clears stale password errors when the password is corrected after submit', () => {
    render(<SignupForm />);
    fillRequiredSignupFields();

    act(() => {
      fireEvent.click(submitButton());
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Password must include an uppercase letter');
    expect(screen.getByLabelText('Password requirements')).toHaveTextContent('Uppercase letter');

    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), {
      target: { value: 'Abcdefg1!' },
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText('Password requirements')).toBeNull();
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent('Strong');
  });
});
