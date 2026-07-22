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
});
