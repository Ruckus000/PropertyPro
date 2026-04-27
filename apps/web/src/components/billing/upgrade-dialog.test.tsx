import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UpgradeDialog } from './upgrade-dialog';

describe('UpgradeDialog', () => {
  it('renders the resolved plan name for any-of gates without "higher plan" fallback copy', () => {
    render(
      <UpgradeDialog
        open
        onOpenChange={vi.fn()}
        featureKey={null}
        upgradePlanId="operations_plus"
        currentPlanId="essentials"
        currentPlanRaw="essentials"
        role="cam"
        communityId={2}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/available on the Operations Plus plan/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/higher plan/i)).not.toBeInTheDocument();
  });
});
