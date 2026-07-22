import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { UpgradeDialog } from './upgrade-dialog';

// Post-B5 drain UpgradeDialog uses the `useUpgradeRequest` mutation hook,
// which calls `useQueryClient` — renders must be wrapped in a provider.
function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('UpgradeDialog', () => {
  it('renders the resolved plan name for any-of gates without "higher plan" fallback copy', () => {
    renderWithClient(
      <UpgradeDialog
        open
        onOpenChange={vi.fn()}
        featureKey={null}
        upgradePlanId="operations_plus"
        currentPlanId="essentials"
        currentPlanRaw="essentials"
        role="property_manager"
        communityId={2}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/available on the Operations Plus plan/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/higher plan/i)).not.toBeInTheDocument();
  });
  it('recommends the apartment-purchasable plan, not the cheaper condo plan', () => {
    // REGRESSION: the fallback recommendation used to search every plan by
    // price, so an apartment community hitting an e-sign gate was offered
    // Professional ($349) — a condo/HOA-only plan the checkout route rejects
    // with "not available for your community type".
    renderWithClient(
      <UpgradeDialog
        open
        onOpenChange={vi.fn()}
        featureKey="hasEsign"
        currentPlanId={null}
        currentPlanRaw={null}
        communityType="apartment"
        role="root_manager"
        communityId={133}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Operations Plus')).toBeInTheDocument();
    expect(within(dialog).queryByText('Professional')).not.toBeInTheDocument();
  });

  it('keeps the condo recommendation on the condo ladder', () => {
    renderWithClient(
      <UpgradeDialog
        open
        onOpenChange={vi.fn()}
        featureKey="hasEsign"
        currentPlanId="essentials"
        currentPlanRaw="essentials"
        communityType="condo_718"
        role="root_manager"
        communityId={134}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Professional')).toBeInTheDocument();
  });

  it('offers a working upgrade CTA to a manager on no plan at all', () => {
    // A null-plan community (never provisioned, or canceled) must still get a
    // purchasable recommendation — the CTA is disabled without one.
    renderWithClient(
      <UpgradeDialog
        open
        onOpenChange={vi.fn()}
        featureKey="hasViolations"
        currentPlanId={null}
        currentPlanRaw={null}
        communityType="condo_718"
        role="root_manager"
        communityId={134}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('No plan')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /upgrade now/i })).toBeEnabled();
  });
});
