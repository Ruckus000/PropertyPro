/**
 * Unit tests for UpgradeDialog (B5 drain).
 *
 * Post-B5: the dialog's "Request upgrade" action is drained into the
 * `useUpgradeRequest` mutation hook. These tests mock that hook and assert
 * the dialog's request-behavior footer wiring, pending/disabled state, the
 * success status, and the error alert (incl. the exact curly-apostrophe
 * fallback literal). `role={null}` resolves to the `request` footer.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutateAsyncMock = vi.fn();

vi.mock('@/hooks/use-upgrade-request', () => ({
  useUpgradeRequest: () => ({ mutateAsync: mutateAsyncMock }),
}));

import { UpgradeDialog } from '../../src/components/billing/upgrade-dialog';

function renderDialog() {
  return render(
    <UpgradeDialog
      open
      onOpenChange={() => {}}
      featureKey="hasViolations"
      currentPlanId="essentials"
      currentPlanRaw="essentials"
      role={null}
      communityId={42}
    />,
  );
}

describe('UpgradeDialog (request behavior)', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
  });

  it('renders the request-behavior footer', () => {
    mutateAsyncMock.mockResolvedValue({ ok: true, notified: 1 });
    renderDialog();
    expect(
      screen.getByRole('button', { name: /Request upgrade/ }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Maybe later/ })).toBeDefined();
  });

  it('calls the mutation with communityId/featureKey/requestedPlan on click', async () => {
    mutateAsyncMock.mockResolvedValue({ ok: true, notified: 2 });
    renderDialog();
    await userEvent.click(
      screen.getByRole('button', { name: /Request upgrade/ }),
    );
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    const arg = mutateAsyncMock.mock.calls[0]![0];
    expect(arg.communityId).toBe(42);
    expect(arg.featureKey).toBe('hasViolations');
    // `in` is true even when the value is null — which is exactly what a
    // feature key outside `CommunityFeatures` produces, since
    // `findCheapestPlanEntryForFeature` filters to nothing and returns null.
    // Assert the resolved plan itself: hasViolations is cheapest on Professional.
    expect(arg.requestedPlan).toBe('professional');
  });

  it('shows the success status after a successful request', async () => {
    mutateAsyncMock.mockResolvedValue({ ok: true, notified: 1 });
    renderDialog();
    await userEvent.click(
      screen.getByRole('button', { name: /Request upgrade/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          /Request sent\. Your community.s root manager has been notified\./,
        ),
      ).toBeDefined(),
    );
  });

  it('shows the alert with the thrown error message', async () => {
    mutateAsyncMock.mockRejectedValue(
      new Error('Tenants cannot request plan upgrades.'),
    );
    renderDialog();
    await userEvent.click(
      screen.getByRole('button', { name: /Request upgrade/ }),
    );
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe('Tenants cannot request plan upgrades.');
    });
  });

  it('shows the exact curly-apostrophe fallback when the hook throws that literal', async () => {
    mutateAsyncMock.mockRejectedValue(
      new Error('We couldn’t send your request. Please try again.'),
    );
    renderDialog();
    await userEvent.click(
      screen.getByRole('button', { name: /Request upgrade/ }),
    );
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe(
        'We couldn’t send your request. Please try again.',
      );
    });
  });

  it('shows the generic fallback when the thrown value is not an Error', async () => {
    mutateAsyncMock.mockRejectedValue('not-an-error');
    renderDialog();
    await userEvent.click(
      screen.getByRole('button', { name: /Request upgrade/ }),
    );
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe('Something went wrong.');
    });
  });
});
