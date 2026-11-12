/**
 * The account menu's Add Community item: asked for only when the menu opens,
 * shown only to whoever the add rule allows, and it opens the same form as the
 * Communities page, from any page (a one-community manager never sees
 * Communities, which sends them straight to their dashboard).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RefObject } from 'react';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const h = vi.hoisted(() => ({
  access: vi.fn(),
  enabledCalls: [] as boolean[],
  modalProps: [] as Array<{ open: boolean; returnFocusTo?: RefObject<HTMLElement | null>; onClose: () => void }>,
}));

vi.mock('@/hooks/use-user-community-count', () => ({ useUserCommunityCount: () => ({ data: 1 }) }));
vi.mock('@/hooks/use-add-community', () => ({
  useAddCommunityAccess: (enabled: boolean) => {
    h.enabledCalls.push(enabled);
    return { data: enabled ? h.access() : undefined };
  },
}));
vi.mock('@/lib/supabase/client', () => ({ createBrowserClient: vi.fn() }));
// The modal is loaded with next/dynamic; stand in a stub that records its props.
vi.mock('next/dynamic', () => ({
  default: () =>
    function AddCommunityModalStub(props: (typeof h.modalProps)[number]) {
      h.modalProps.push(props);
      return props.open ? (
        <div role="dialog" aria-label="Add a Community">
          <button type="button" onClick={props.onClose}>
            Close form
          </button>
        </div>
      ) : null;
    },
}));

import { ProfileMenu } from '../../src/components/layout/profile-menu';

function renderMenu() {
  return render(<ProfileMenu userName="Rita Root" userEmail="rita@example.test" communityId={1} />);
}

beforeEach(() => {
  h.access.mockReturnValue({ allowed: true, billingGroupId: 9 });
  h.enabledCalls = [];
  h.modalProps = [];
});

afterEach(cleanup);

describe('ProfileMenu Add Community', () => {
  it('does not ask until the menu opens', () => {
    renderMenu();
    expect(h.enabledCalls.every((e) => e === false)).toBe(true);
  });

  it('is shown to the billing owner who is root, and opens the form', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Rita Root account menu' });

    await userEvent.click(trigger);
    expect(h.enabledCalls).toContain(true);
    // Not mounted yet: the modal (and Stripe with it) loads on first use.
    expect(h.modalProps).toHaveLength(0);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Add Community' }));

    expect(screen.getByRole('dialog', { name: 'Add a Community' })).toBeInTheDocument();
    // Focus goes back to the menu button, not the menu item that is now gone.
    expect(h.modalProps.at(-1)?.returnFocusTo?.current).toBe(trigger);
  });

  it('closes the form when it asks to', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Rita Root account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add Community' }));

    await userEvent.click(screen.getByRole('button', { name: 'Close form' }));

    expect(screen.queryByRole('dialog', { name: 'Add a Community' })).toBeNull();
  });

  it('is not shown to anyone the add rule refuses', async () => {
    h.access.mockReturnValue({ allowed: false, billingGroupId: null });
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Rita Root account menu' }));

    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Add Community' })).toBeNull();
  });
});
