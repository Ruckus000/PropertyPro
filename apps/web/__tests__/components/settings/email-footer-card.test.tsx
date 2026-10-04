import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { dataRef, mutateMock } = vi.hoisted(() => ({
  dataRef: { current: { customEmailFooter: 'Office hours 9-5' } as Record<string, unknown> | undefined },
  mutateMock: vi.fn(),
}));

vi.mock('@/hooks/use-live-branding', () => ({
  useLiveBranding: () => ({ data: dataRef.current, isError: false }),
  useSaveLiveBranding: () => ({ mutate: mutateMock, isPending: false, isError: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EmailFooterCard } from '@/components/settings/email-footer-card';

beforeEach(() => {
  vi.clearAllMocks();
  dataRef.current = { customEmailFooter: 'Office hours 9-5' };
});

describe('EmailFooterCard', () => {
  it('shows the stored footer and names the community it applies to', () => {
    render(<EmailFooterCard communityId={42} communityName="Sunset Condos" />);
    expect(screen.getByLabelText('Footer text')).toHaveValue('Office hours 9-5');
    expect(screen.getByText(/every email from Sunset Condos/)).toBeInTheDocument();
  });

  it('saves only after a change, trimmed', async () => {
    const user = userEvent.setup();
    render(<EmailFooterCard communityId={42} communityName="Sunset Condos" />);
    const save = screen.getByRole('button', { name: 'Save footer' });
    expect(save).toBeDisabled();

    const box = screen.getByLabelText('Footer text');
    await user.clear(box);
    await user.type(box, '  Call 555-0100  ');
    await user.click(save);

    expect(mutateMock).toHaveBeenCalledWith({ customEmailFooter: 'Call 555-0100' }, expect.anything());
  });

  it('clears the footer with an empty string', async () => {
    const user = userEvent.setup();
    render(<EmailFooterCard communityId={42} communityName="Sunset Condos" />);
    await user.clear(screen.getByLabelText('Footer text'));
    await user.click(screen.getByRole('button', { name: 'Save footer' }));
    expect(mutateMock).toHaveBeenCalledWith({ customEmailFooter: '' }, expect.anything());
  });
});
