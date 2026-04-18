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
});
