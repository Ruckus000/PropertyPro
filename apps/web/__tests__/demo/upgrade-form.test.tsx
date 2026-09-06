/**
 * Unit tests for UpgradeForm (B5 batch 4C drain).
 *
 * Post-B5 drain: the component delegates the upgrade POST to
 * `useDemoSelfServiceUpgrade`. These tests mock that hook and assert the
 * component's form behavior, error copy, and success redirect are
 * preserved exactly.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CommunityType } from '@propertypro/shared';

const mutateMock = vi.fn();
const useUpgradeMock = vi.fn();

vi.mock('@/hooks/use-demo-self-service-upgrade', () => ({
  useDemoSelfServiceUpgrade: () => useUpgradeMock(),
}));

import { UpgradeForm } from '../../src/app/demo/[slug]/upgrade/upgrade-form';

const plans = [
  {
    id: 'starter',
    label: 'Starter',
    monthlyPriceUsd: 49,
    description: 'For small associations',
  },
  {
    id: 'pro',
    label: 'Pro',
    monthlyPriceUsd: 99,
    description: 'For larger associations',
  },
];

function renderForm() {
  return render(
    <UpgradeForm
      slug="sunset-condos"
      communityName="Sunset Condos"
      communityType={'condo_718' as CommunityType}
      plans={plans}
    />,
  );
}

describe('UpgradeForm', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    useUpgradeMock.mockReset();
    useUpgradeMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the plan cards', () => {
    renderForm();
    expect(screen.getByText('Starter')).toBeDefined();
    expect(screen.getByText('Pro')).toBeDefined();
  });

  it('does not submit without a selected plan and email', () => {
    renderForm();
    // No checkout form is shown until a plan is selected.
    expect(screen.queryByText('Start Checkout')).toBeNull();
    fireEvent.click(screen.getByText('Starter'));
    // Plan selected but email empty — submit guarded.
    const button = screen.getByText('Start Checkout');
    fireEvent.click(button);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('submits the selected plan + trimmed email/name via the hook', () => {
    renderForm();
    fireEvent.click(screen.getByText('Starter'));
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: '  owner@example.com  ' },
    });
    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: '  Sunset HOA  ' },
    });
    fireEvent.click(screen.getByText('Start Checkout'));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0]![0]).toEqual({
      slug: 'sunset-condos',
      planId: 'starter',
      customerEmail: 'owner@example.com',
      customerName: 'Sunset HOA',
    });
  });

  it('shows pending/disabled state while the mutation is pending', () => {
    useUpgradeMock.mockReturnValue({ mutate: mutateMock, isPending: true });
    renderForm();
    fireEvent.click(screen.getByText('Starter'));
    const button = screen.getByRole('button', { name: /Starting checkout/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('displays the error message from the hook onError callback', () => {
    renderForm();
    fireEvent.click(screen.getByText('Starter'));
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByText('Start Checkout'));

    const { onError } = mutateMock.mock.calls[0]![1];
    act(() => onError(new Error('This demo has expired')));

    expect(screen.getByRole('alert').textContent).toContain(
      'This demo has expired',
    );
  });

  it('shows the generic fallback when onError receives a non-Error', () => {
    renderForm();
    fireEvent.click(screen.getByText('Starter'));
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByText('Start Checkout'));

    const { onError } = mutateMock.mock.calls[0]![1];
    act(() => onError('weird'));

    expect(screen.getByRole('alert').textContent).toContain(
      'Something went wrong. Please try again.',
    );
  });

  it('redirects to checkoutUrl on success', () => {
    const originalLocation = window.location as string & Location;
    // @ts-expect-error — replace for assertion
    delete window.location;
    // @ts-expect-error — minimal stub
    window.location = { href: '' };

    renderForm();
    fireEvent.click(screen.getByText('Starter'));
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByText('Start Checkout'));

    const { onSuccess } = mutateMock.mock.calls[0]![1];
    onSuccess({ checkoutUrl: 'https://stripe.test/checkout' });

    expect(window.location.href).toBe('https://stripe.test/checkout');

    window.location = originalLocation;
  });

  it('does not redirect when checkoutUrl is missing', () => {
    const originalLocation = window.location as string & Location;
    // @ts-expect-error — replace for assertion
    delete window.location;
    // @ts-expect-error — minimal stub
    window.location = { href: 'unchanged' };

    renderForm();
    fireEvent.click(screen.getByText('Starter'));
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByText('Start Checkout'));

    const { onSuccess } = mutateMock.mock.calls[0]![1];
    onSuccess({ checkoutUrl: undefined });

    expect(window.location.href).toBe('unchanged');

    window.location = originalLocation;
  });
});
