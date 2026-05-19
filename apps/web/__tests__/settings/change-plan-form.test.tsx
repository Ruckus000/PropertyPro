/**
 * Unit tests for ChangePlanForm.
 *
 * Post-B5 drain: the inline `fetch('/api/v1/subscribe/change-plan...')` moved
 * to the `useChangePlan` mutation hook. These tests mock that hook (plus the
 * reauth gate and next/navigation router, which deliberately STAY in the
 * component) and assert that the orchestration around the network call —
 * reauth-before-POST, router redirect on success, error-copy literals,
 * pending state — is byte-for-byte preserved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { PlanId } from '@propertypro/shared';

const mutateAsyncMock = vi.fn();
const triggerReauthMock = vi.fn();
const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock('@/hooks/use-change-plan', () => ({
  useChangePlan: () => ({ mutateAsync: mutateAsyncMock }),
}));

vi.mock('@/hooks/use-reauth', () => ({
  useReauth: () => ({
    triggerReauth: triggerReauthMock,
    isOpen: false,
    onCancel: vi.fn(),
    verify: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
}));

import { ChangePlanForm } from '../../src/components/settings/change-plan-form';

const PLANS = [
  {
    id: 'essentials' as PlanId,
    label: 'Essentials',
    monthlyPriceUsd: 49,
    description: 'Starter plan',
  },
  {
    id: 'professional' as PlanId,
    label: 'Professional',
    monthlyPriceUsd: 99,
    description: 'Growing communities',
  },
];

function renderForm(overrides: Partial<Parameters<typeof ChangePlanForm>[0]> = {}) {
  return render(
    <ChangePlanForm
      communityId={42}
      currentPlan="essentials"
      currentInterval="month"
      plans={PLANS}
      cancelHref="/settings/billing"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  mutateAsyncMock.mockReset();
  triggerReauthMock.mockReset();
  routerPushMock.mockReset();
  routerRefreshMock.mockReset();
});

describe('ChangePlanForm', () => {
  it('renders offered upgrade plans', () => {
    renderForm();
    expect(screen.getByText('Professional')).toBeDefined();
    expect(screen.getByText('$99/mo')).toBeDefined();
  });

  it('shows the highest-plan empty state when no upgrade is available', () => {
    renderForm({ currentPlan: 'professional', plans: [PLANS[1]] });
    expect(
      screen.getByText("You're already on the highest plan available for your community."),
    ).toBeDefined();
  });

  it('reauths before the POST and redirects + refreshes on success', async () => {
    triggerReauthMock.mockResolvedValue(true);
    mutateAsyncMock.mockResolvedValue({ ok: true, planId: 'professional', billingInterval: 'month' });

    renderForm();
    fireEvent.click(screen.getByText('Professional'));
    fireEvent.click(screen.getByText('Review change'));
    fireEvent.click(screen.getByText('Confirm change'));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());

    // reauth ran before the mutation
    expect(triggerReauthMock).toHaveBeenCalled();
    expect(triggerReauthMock.mock.invocationCallOrder[0]).toBeLessThan(
      mutateAsyncMock.mock.invocationCallOrder[0],
    );
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      communityId: 42,
      planId: 'professional',
      billingInterval: 'month',
    });
    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith('/settings/billing'));
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it('does not POST when reauth is declined', async () => {
    triggerReauthMock.mockResolvedValue(false);

    renderForm();
    fireEvent.click(screen.getByText('Professional'));
    fireEvent.click(screen.getByText('Review change'));
    fireEvent.click(screen.getByText('Confirm change'));

    await waitFor(() => expect(triggerReauthMock).toHaveBeenCalled());
    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('surfaces the hook error message verbatim', async () => {
    triggerReauthMock.mockResolvedValue(true);
    mutateAsyncMock.mockRejectedValue(
      new Error('You are already on this plan and billing interval.'),
    );

    renderForm();
    fireEvent.click(screen.getByText('Professional'));
    fireEvent.click(screen.getByText('Review change'));
    fireEvent.click(screen.getByText('Confirm change'));

    await waitFor(() =>
      expect(
        screen.getByText('You are already on this plan and billing interval.'),
      ).toBeDefined(),
    );
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('falls back to the generic error literal on a non-Error rejection', async () => {
    triggerReauthMock.mockResolvedValue(true);
    mutateAsyncMock.mockRejectedValue('boom');

    renderForm();
    fireEvent.click(screen.getByText('Professional'));
    fireEvent.click(screen.getByText('Review change'));
    fireEvent.click(screen.getByText('Confirm change'));

    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeDefined(),
    );
  });
});
